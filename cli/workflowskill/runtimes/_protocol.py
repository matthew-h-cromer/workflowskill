"""Runtime protocol — defines the interface all runtimes must implement."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Runtime(Protocol):
    """An execution environment that provides durability guarantees for workflows.

    Each runtime implements three methods:

    - ``run_workflow()``: Execute a workflow function, providing crash recovery,
      replay, and state persistence appropriate for the platform.
    - ``execute_step()``: Execute and checkpoint a single action. On crash
      recovery, completed steps return cached results without re-executing.
    - ``wait_for_signal()``: Pause workflow execution and wait for an external
      event (human approval, webhook, scheduled trigger, etc.).

    The runtime holds a reference to the active :class:`~workflowskill.toolkits.Toolkit`
    and calls ``toolkit.execute()`` inside ``execute_step()``. This means the
    runtime owns the durability boundary around each action call.

    Example implementations:

    - ``DBOSRuntime``: Durable execution via DBOS (SQLite or Postgres).
      Each step is checkpointed; crash recovery replays from the last
      completed step.
    - ``TemporalRuntime``: Durable execution via Temporal. Activities are
      registered with the Temporal worker; the workflow is a Temporal
      workflow definition.
    """

    name: str

    async def run_workflow(
        self,
        workflow_fn: Callable[..., Awaitable[dict[str, Any]]],
        inputs: dict[str, Any],
        *,
        workflow_id: str | None = None,
    ) -> dict[str, Any]:
        """Execute a workflow function with durability guarantees.

        Sets up the execution context so that ``workflow.execute_activity()``
        calls inside ``workflow_fn`` are routed to ``execute_step()``.

        Args:
            workflow_fn:  The workflow's ``run`` method (or any async callable
                          that accepts keyword arguments and returns a dict).
            inputs:       Keyword arguments to pass to ``workflow_fn``.
            workflow_id:  Optional opaque identifier used by durable runtimes
                          as the checkpoint/idempotency key. For the DBOS
                          runtime this is the SKILL.md file path, enabling
                          crash recovery by re-loading the workflow from disk.
                          Non-durable runtimes may ignore this.

        Returns:
            The dict returned by ``workflow_fn``.
        """
        ...

    async def execute_step(
        self,
        action: str,
        args: dict[str, Any],
        *,
        timeout: timedelta | None = None,
        retry_policy: Any | None = None,
    ) -> dict[str, Any]:
        """Execute a single action as a checkpointed step.

        Called by the execution context (via ContextVar) each time workflow
        code calls ``workflow.execute_activity()``. The runtime wraps the
        toolkit call with platform-specific checkpointing.

        Args:
            action:       The action name, e.g. ``"slack.post_message"``.
            args:         The arguments dict.
            timeout:      Optional per-step timeout. Defaults to 30s if
                          not specified and the runtime enforces timeouts.
            retry_policy: Optional retry configuration. Shape is runtime-
                          specific; pass the ``RetryPolicy`` dataclass from
                          the workflow preamble.

        Returns:
            The dict result from the toolkit.
        """
        ...

    async def wait_for_signal(
        self,
        name: str,
        *,
        prompt: str | None = None,
        timeout: timedelta | None = None,
    ) -> Any:
        """Pause workflow execution and wait for an external signal.

        Suspends the workflow at this point. When a signal with the given
        name is received, execution resumes and the signal value is returned.

        Args:
            name:    Signal name to wait for.
            prompt:  Optional human-readable prompt (shown in CLI, etc.).
            timeout: How long to wait before raising. Defaults to 24 hours
                     if not specified and the runtime enforces timeouts.

        Returns:
            The value sent with the signal.
        """
        ...
