"""High-level runner: load SKILL.md → start Temporal → execute → return result."""

from __future__ import annotations

import contextlib
import inspect
import os
import uuid
from collections.abc import Callable, Generator
from pathlib import Path
from typing import Any

from temporalio.runtime import LoggingConfig, Runtime, TelemetryConfig
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from workflowskill.actions.registry import ActionRegistry
from workflowskill.loader.skill_loader import load_skill

TASK_QUEUE = "workflowskill-local"

# Suppress benign "transport error" warning during worker shutdown.
# The default core log filter is WARN for temporalio_sdk_core; we keep
# that but raise the worker sub-module to ERROR.
_RUNTIME = Runtime(
    telemetry=TelemetryConfig(
        logging=LoggingConfig(
            filter="ERROR,temporalio_sdk_core=WARN,temporalio_sdk_core::worker=ERROR,temporalio_client=WARN,temporalio_sdk=WARN,temporal_sdk_bridge=WARN"
        )
    )
)


@contextlib.contextmanager
def _suppress_fd_output() -> Generator[None, None, None]:
    """Temporarily redirect OS-level stdout/stderr (fd 1 and fd 2) to /dev/null."""
    devnull = os.open(os.devnull, os.O_WRONLY)
    saved_stdout: int | None = None
    saved_stderr: int | None = None
    try:
        saved_stdout = os.dup(1)
        saved_stderr = os.dup(2)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        os.close(devnull)
        devnull = -1
        yield
    finally:
        if devnull != -1:
            os.close(devnull)
        if saved_stderr is not None:
            os.dup2(saved_stderr, 2)
            os.close(saved_stderr)
        if saved_stdout is not None:
            os.dup2(saved_stdout, 1)
            os.close(saved_stdout)


async def run_skill(
    skill_path: str | Path,
    inputs: dict[str, Any] | None = None,
    registry: ActionRegistry | None = None,
    on_server_started: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Load and execute a SKILL.md workflow end-to-end.

    This function:
    1. Loads the SKILL.md via the skill loader.
    2. Merges provided inputs with frontmatter defaults.
    3. Starts an embedded Temporal environment (no external server needed).
    4. Registers the workflow class and all actions from the registry.
    5. Executes the workflow with the merged inputs.
    6. Shuts down cleanly and returns the result.

    Args:
        skill_path: Path to the SKILL.md file.
        inputs: Input values to pass to the workflow. Keys not provided fall
                back to frontmatter defaults.
        registry: ActionRegistry with registered tool handlers. If None, an
                  empty registry is used (only works for workflows with no
                  activity calls).
        on_server_started: Optional callback invoked with the server address
                           string after the embedded Temporal server is ready.

    Returns:
        The dict returned by the workflow's @workflow.run method.

    Raises:
        SkillLoadError: If the SKILL.md cannot be parsed.
        Exception: If the workflow execution fails.
    """
    skill = load_skill(skill_path)
    registry = registry or ActionRegistry()

    # Build merged inputs: start with frontmatter defaults, overlay provided values
    merged: dict[str, Any] = {}
    for input_name, spec in skill.inputs.items():
        if spec.default is not None:
            merged[input_name] = spec.default
    if inputs:
        merged.update(inputs)

    # Build ordered args list by inspecting run method parameters
    args = _build_args(skill.workflow_class, merged)

    # Start embedded Temporal environment (no external server required).
    # Suppress the Temporal CLI subprocess banner at the OS fd level so it
    # never races with our own output, then notify via callback.
    with _suppress_fd_output():
        env = await WorkflowEnvironment.start_local(runtime=_RUNTIME)

    if on_server_started is not None:
        address = env.client.service_client.config.target_host
        on_server_started(address)

    async with env:
        activities = registry.get_activities()

        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[skill.workflow_class],
            activities=activities,
            # Workflow code is loaded dynamically from SKILL.md files; the sandbox
            # cannot re-import classes that don't exist as stable modules on disk.
            workflow_runner=UnsandboxedWorkflowRunner(),
        ):
            workflow_id = f"{skill.name}-{uuid.uuid4()}"
            result: Any = await env.client.execute_workflow(
                skill.workflow_class.run,  # type: ignore[attr-defined]
                args=args,
                id=workflow_id,
                task_queue=TASK_QUEUE,
            )

    if not isinstance(result, dict):
        raise ValueError(
            f"Workflow '{skill.name}' returned {type(result).__name__!r} instead of dict"
        )

    if skill.outputs:
        missing = [key for key in skill.outputs if key not in result]
        if missing:
            raise ValueError(
                f"Workflow '{skill.name}' result is missing declared output keys: {missing}"
            )

    return result


def _build_args(workflow_class: type, merged: dict[str, Any]) -> list[Any]:
    """Build positional args list for the workflow run method from a dict of inputs."""
    try:
        run_method = getattr(workflow_class, "run", None)
        if run_method is None:
            return []
        sig = inspect.signature(run_method)
        params = [(name, p) for name, p in sig.parameters.items() if name not in ("self", "cls")]
    except (ValueError, TypeError):
        return []

    if not params:
        return []

    args: list[Any] = []
    for name, param in params:
        if name in merged:
            args.append(merged[name])
        elif param.default is not inspect.Parameter.empty:
            args.append(param.default)
        else:
            raise ValueError(
                f"Required workflow input '{name}' was not provided and has no default."
            )

    return args
