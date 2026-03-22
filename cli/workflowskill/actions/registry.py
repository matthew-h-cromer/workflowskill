"""ActionRegistry — register platform tools as Temporal activities."""

from __future__ import annotations

import inspect
import time
from collections.abc import Awaitable, Callable
from typing import Any, cast

from temporalio import activity

# Handler type: sync or async function that takes a dict and returns a dict
Handler = Callable[[dict[str, Any]], dict[str, Any] | Awaitable[dict[str, Any]]]


class ActionRegistry:
    """Registry that wraps platform-provided tool handlers as Temporal activities.

    Consumers (CLI, plugins) register their tools here. The registry wraps each
    handler as a proper @activity.defn function so Temporal can execute it with
    full durability, retry, and timeout semantics.

    Example::

        registry = ActionRegistry()
        registry.register("api", api_handler)
        registry.register("llm", llm_handler)

        # Then pass to run_skill() or the runner
        result = await run_skill("my-skill.md", inputs, registry)
    """

    def __init__(
        self,
        on_activity_start: Callable[[str, dict[str, Any]], None] | None = None,
        on_activity_complete: Callable[[str, int], None] | None = None,
    ) -> None:
        self._handlers: dict[str, Handler] = {}
        self._activities: list[Callable[..., Any]] = []
        self._on_activity_start = on_activity_start
        self._on_activity_complete = on_activity_complete

    def register(self, name: str, handler: Handler) -> None:
        """Register a handler as a named Temporal activity.

        Args:
            name: The activity name used in workflow.execute_activity() calls.
            handler: An async (or sync) function taking a dict and returning a dict.
        """
        if name in self._handlers:
            raise ValueError(f"Action '{name}' is already registered")

        self._handlers[name] = handler

        on_start = self._on_activity_start
        on_complete = self._on_activity_complete

        # Create a @activity.defn function with the correct name.
        # Temporal uses the function name as the activity type by default,
        # so we set __name__ and __qualname__ to match the registered name.
        if inspect.iscoroutinefunction(handler):
            _h = handler  # capture for closure

            async def _async_activity(args: dict[str, Any]) -> dict[str, Any]:
                if on_start:
                    on_start(name, args)
                t0 = time.monotonic()
                try:
                    result: dict[str, Any] = await _h(args)
                    return result
                finally:
                    if on_complete:
                        on_complete(name, int((time.monotonic() - t0) * 1000))

            _async_activity.__name__ = name
            _async_activity.__qualname__ = name
            wrapped: Callable[..., Any] = activity.defn(_async_activity)
        else:
            _h2 = handler  # capture for closure

            def _sync_activity(args: dict[str, Any]) -> dict[str, Any]:
                if on_start:
                    on_start(name, args)
                t0 = time.monotonic()
                try:
                    return cast(dict[str, Any], _h2(args))
                finally:
                    if on_complete:
                        on_complete(name, int((time.monotonic() - t0) * 1000))

            _sync_activity.__name__ = name
            _sync_activity.__qualname__ = name
            wrapped = activity.defn(_sync_activity)

        self._activities.append(wrapped)

    def get_activities(self) -> list[Callable[..., Any]]:
        """Return all registered activities for worker registration."""
        return list(self._activities)

    def get_handler(self, name: str) -> Handler:
        """Return the raw handler function for a named action."""
        if name not in self._handlers:
            raise KeyError(f"No action registered with name '{name}'")
        return self._handlers[name]

    def has(self, name: str) -> bool:
        """Check if an action is registered."""
        return name in self._handlers

    def names(self) -> list[str]:
        """Return names of all registered actions."""
        return list(self._handlers.keys())
