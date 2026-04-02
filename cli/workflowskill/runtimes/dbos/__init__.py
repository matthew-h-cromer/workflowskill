"""DBOS runtime — durable workflow execution with crash recovery.

Each ``execute_step()`` call is wrapped in a ``@DBOS.step()``, so completed
steps are checkpointed to SQLite (local) or Postgres (production). If the
process crashes mid-workflow, re-running with the same ``workflow_id``
(the SKILL.md file path) resumes from the last completed step — skipping
actions that already succeeded.

``wait_for_signal()`` uses DBOS send/recv messaging for durable pause/resume.
"""

from __future__ import annotations

import json
import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import timedelta
from pathlib import Path
from typing import Any

from dbos import DBOS

import workflowskill.workflow_context as _wf_ctx
from workflowskill.toolkits._protocol import Toolkit

# ---------------------------------------------------------------------------
# Module-level state — set for the duration of each workflow execution.
# DBOS requires module-level decorated functions; these delegate to the
# active DBOSRuntime instance via a ContextVar (async-safe for concurrent
# workflows on the same event loop).
# ---------------------------------------------------------------------------

_active_runtime_var: ContextVar[DBOSRuntime | None] = ContextVar(
    "dbos_active_runtime", default=None
)


# ---------------------------------------------------------------------------
# DBOS-decorated module-level functions.
# Must live at module scope for DBOS to register them at import time.
# ---------------------------------------------------------------------------


def _get_active_runtime() -> DBOSRuntime:
    """Retrieve the active runtime from the ContextVar, raising if unset."""
    rt = _active_runtime_var.get()
    if rt is None:
        raise RuntimeError("No active DBOSRuntime — _active_runtime_var was not set")
    return rt


# These module-level decorated functions must remain at module scope so DBOS
# can register them by fully-qualified name at import time. During crash
# recovery, DBOS looks them up in its global registry to replay workflows.


@DBOS.workflow()
async def _dbos_run_workflow(skill_path: str, inputs_json: str) -> dict[str, Any]:
    """Durable DBOS workflow wrapper.

    Takes serializable arguments so DBOS can checkpoint and replay them.
    On crash recovery, DBOS re-enters this function and replays completed
    steps from cache without re-executing them.

    Loads the workflow class fresh from *skill_path* so that replay works
    correctly after a process restart — no function objects to serialize.
    """
    from workflowskill.loader.skill_loader import load_skill

    inputs: dict[str, Any] = json.loads(inputs_json)
    rt = _get_active_runtime()

    loaded = load_skill(Path(skill_path))

    tokens = _wf_ctx.set_context(rt._dispatch, rt._signal)
    try:
        instance = loaded.workflow_class()
        result: dict[str, Any] = await instance.run(**inputs)
        return result
    finally:
        _wf_ctx.reset_context(tokens)


@DBOS.step()
async def _dbos_execute_step(action: str, args_json: str) -> dict[str, Any]:
    """Durable DBOS step — checkpointed action execution.

    On crash recovery, DBOS returns the cached result for this step index
    without calling the toolkit again.
    """
    args: dict[str, Any] = json.loads(args_json)
    rt = _get_active_runtime()

    if rt._toolkit is None:
        raise RuntimeError(
            f"Action '{action}' called but no toolkit is configured. "
            "Pass a toolkit to DBOSRuntime() or use --toolkit on the CLI."
        )

    return await rt._toolkit.execute(action, args)


# ---------------------------------------------------------------------------
# DBOSRuntime class
# ---------------------------------------------------------------------------


class DBOSRuntime:
    """Durable runtime backed by DBOS.

    Wraps each workflow execution in a ``@DBOS.workflow()`` and each action
    call in a ``@DBOS.step()``. DBOS persists step results to a local SQLite
    database (or Postgres in production), enabling crash recovery.

    Args:
        toolkit:              Toolkit to dispatch action calls to.
        on_activity_start:    Optional callback called before each action step.
        on_activity_complete: Optional callback called after each action step
                              with the action name and elapsed milliseconds.
        on_signal_waiting:    Optional async callback invoked when the workflow
                              calls ``wait_for_signal``. Receives
                              ``(signal_name, prompt)`` and should return the
                              signal value.
    """

    name = "dbos"

    def __init__(
        self,
        toolkit: Toolkit | None = None,
        on_activity_start: Callable[[str, dict[str, Any]], None] | None = None,
        on_activity_complete: Callable[[str, int], None] | None = None,
        on_activity_error: Callable[[str, int, BaseException], None] | None = None,
        on_signal_waiting: Callable[[str, str | None], Awaitable[Any]] | None = None,
    ) -> None:
        self._toolkit = toolkit
        self._on_activity_start = on_activity_start
        self._on_activity_complete = on_activity_complete
        self._on_activity_error = on_activity_error
        self._on_signal_waiting = on_signal_waiting
        self._dbos: DBOS | None = None

    def _ensure_dbos(self) -> None:
        if self._dbos is None:
            self._dbos = DBOS(config={"name": "workflowskill", "run_admin_server": False})
            DBOS.launch()

    def destroy(self) -> None:
        """Shut down DBOS and release database connections."""
        if self._dbos is not None:
            DBOS.destroy()
            self._dbos = None

    async def run_workflow(
        self,
        workflow_fn: Callable[..., Awaitable[dict[str, Any]]],
        inputs: dict[str, Any],
        *,
        workflow_id: str | None = None,
    ) -> dict[str, Any]:
        """Execute the workflow with DBOS durability.

        The *workflow_id* must be the SKILL.md file path. DBOS uses it as the
        checkpoint key; on recovery it reloads the workflow class from that
        path rather than trying to serialize the function object.

        Note: *workflow_fn* is not used directly — DBOS reloads the workflow
        class from *workflow_id* inside ``_dbos_run_workflow()`` for replay
        correctness.
        """
        if workflow_id is None:
            raise ValueError(
                "DBOSRuntime.run_workflow() requires workflow_id — "
                "pass the SKILL.md file path as workflow_id."
            )

        self._ensure_dbos()
        token = _active_runtime_var.set(self)
        try:
            result = await _dbos_run_workflow(workflow_id, json.dumps(inputs))
        finally:
            _active_runtime_var.reset(token)

        return result

    async def _dispatch(
        self,
        action: str,
        args: dict[str, Any],
        step_index: int,
        display_label: str,
    ) -> dict[str, Any]:
        """ContextVar dispatch — wraps execute_step with lifecycle callbacks."""
        if self._on_activity_start:
            self._on_activity_start(action, args)
        t0 = time.monotonic()
        try:
            result = await self.execute_step(action, args)
        except BaseException as exc:
            if self._on_activity_error:
                self._on_activity_error(action, int((time.monotonic() - t0) * 1000), exc)
            raise
        else:
            if self._on_activity_complete:
                self._on_activity_complete(action, int((time.monotonic() - t0) * 1000))
            return result

    async def execute_step(
        self,
        action: str,
        args: dict[str, Any],
        *,
        timeout: timedelta | None = None,
        retry_policy: Any | None = None,
    ) -> dict[str, Any]:
        """Execute one action as a DBOS-checkpointed step."""
        return await _dbos_execute_step(action, json.dumps(args))

    async def _signal(self, name: str, prompt: str | None, timeout: Any) -> Any:
        """ContextVar signal handler — delegates to wait_for_signal."""
        td = (
            timeout
            if isinstance(timeout, timedelta)
            else (timedelta(seconds=float(timeout)) if timeout is not None else None)
        )
        return await self.wait_for_signal(name, prompt=prompt, timeout=td)

    async def wait_for_signal(
        self,
        name: str,
        *,
        prompt: str | None = None,
        timeout: timedelta | None = None,
    ) -> Any:
        """Durably wait for an external signal using DBOS messaging.

        Runs the ``on_signal_waiting`` callback (e.g., a CLI prompt), sends
        the result via ``DBOS.send_async()``, then receives it back via
        ``DBOS.recv_async()``.

        On crash recovery: if the signal was already received, DBOS replays
        it instantly. If not, the callback re-fires and the prompt re-appears.
        """
        wf_id = DBOS.workflow_id
        if wf_id is None:
            raise RuntimeError("wait_for_signal() called outside a DBOS workflow context")

        result: Any = None
        if self._on_signal_waiting is not None:
            result = await self._on_signal_waiting(name, prompt)
        await DBOS.send_async(wf_id, result, topic=name)

        timeout_secs = timeout.total_seconds() if timeout is not None else 86400.0
        return await DBOS.recv_async(name, timeout_seconds=timeout_secs)


def create_runtime(
    toolkit: Toolkit | None = None,
    on_activity_start: Callable[[str, dict[str, Any]], None] | None = None,
    on_activity_complete: Callable[[str, int], None] | None = None,
    on_activity_error: Callable[[str, int, BaseException], None] | None = None,
    on_signal_waiting: Callable[[str, str | None], Awaitable[Any]] | None = None,
) -> DBOSRuntime:
    """Factory used by :func:`workflowskill.runtimes.load_runtime`."""
    return DBOSRuntime(
        toolkit=toolkit,
        on_activity_start=on_activity_start,
        on_activity_complete=on_activity_complete,
        on_activity_error=on_activity_error,
        on_signal_waiting=on_signal_waiting,
    )
