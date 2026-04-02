"""Runtimes — workflow execution environments for workflowskill."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from workflowskill._plugin_loader import load_plugin
from workflowskill.runtimes._protocol import Runtime
from workflowskill.toolkits._protocol import Toolkit

_REGISTRY: dict[str, str] = {
    "dbos": "workflowskill.runtimes.dbos",
}


def load_runtime(
    name: str,
    toolkit: Toolkit | None = None,
    on_activity_start: Callable[[str, dict[str, Any]], None] | None = None,
    on_activity_complete: Callable[[str, int], None] | None = None,
    on_activity_error: Callable[[str, int, BaseException], None] | None = None,
    on_signal_waiting: Callable[[str, str | None], Awaitable[Any]] | None = None,
) -> Runtime:
    """Load and instantiate a runtime by name.

    Args:
        name:                 Runtime name, e.g. ``"dbos"``.
        toolkit:              Toolkit to use for action dispatch. ``None`` is
                              valid for workflows that make no activity calls.
        on_activity_start:    Optional display callback, called before each step.
        on_activity_complete: Optional display callback, called after each step
                              with ``(action_name, elapsed_ms)``.
        on_activity_error:    Optional display callback, called when a step fails
                              with ``(action_name, elapsed_ms, exception)``.
        on_signal_waiting:    Optional async callback invoked on
                              ``wait_for_signal``. Receives
                              ``(signal_name, prompt)`` and should return the
                              signal value.

    Raises:
        ValueError: If the runtime name is not registered.
    """
    runtime: Runtime = load_plugin(
        _REGISTRY,
        name,
        "runtime",
        "create_runtime",
        toolkit=toolkit,
        on_activity_start=on_activity_start,
        on_activity_complete=on_activity_complete,
        on_activity_error=on_activity_error,
        on_signal_waiting=on_signal_waiting,
    )
    return runtime


def available_runtimes() -> list[str]:
    """Return the list of registered runtime names."""
    return sorted(_REGISTRY)


__all__ = ["Runtime", "load_runtime", "available_runtimes"]
