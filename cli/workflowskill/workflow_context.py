"""Async-safe execution context for user workflow code.

Uses ``contextvars.ContextVar`` so concurrent async workflows each get
their own dispatch function without interfering with each other.

The generated workflow module imports this to dispatch ``execute_activity()``
and ``wait_for_signal()`` calls without needing the runtime passed as an
explicit parameter — the runtime sets the context before calling the
workflow function.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from contextvars import ContextVar, Token
from typing import Any

# ---------------------------------------------------------------------------
# Action dispatch — routes execute_activity() calls to the active runtime
# ---------------------------------------------------------------------------

_DispatchFn = Callable[[str, dict[str, Any], int, str], Awaitable[dict[str, Any]]]
_SignalFn = Callable[[str, str | None, Any | None], Awaitable[Any]]

_dispatch_var: ContextVar[_DispatchFn | None] = ContextVar("wf_dispatch", default=None)
_signal_var: ContextVar[_SignalFn | None] = ContextVar("wf_signal", default=None)


ContextTokens = tuple[Token[_DispatchFn | None], Token[_SignalFn | None]]


def set_context(
    dispatch: _DispatchFn,
    signal: _SignalFn | None = None,
) -> ContextTokens:
    """Set the dispatch (and optionally signal) functions for the current async task.

    Called by the runtime inside ``run_workflow()`` before invoking the
    workflow function. Returns tokens that can be passed to
    :func:`reset_context` to restore the previous state.
    """
    dispatch_token = _dispatch_var.set(dispatch)
    signal_token = _signal_var.set(signal)
    return dispatch_token, signal_token


def reset_context(tokens: ContextTokens) -> None:
    """Reset context vars using the tokens returned by :func:`set_context`."""
    dispatch_token, signal_token = tokens
    _dispatch_var.reset(dispatch_token)
    _signal_var.reset(signal_token)


async def dispatch_action(
    name: str,
    args: dict[str, Any],
    step_index: int,
    display_label: str,
) -> dict[str, Any]:
    """Dispatch an execute_activity() call to the active runtime's step handler."""
    fn = _dispatch_var.get()
    if fn is None:
        raise RuntimeError(
            "No workflow execution context — set_context() was not called. "
            "This usually means the workflow was invoked outside of a runtime."
        )
    return await fn(name, args, step_index, display_label)


async def wait_for_signal(
    name: str,
    prompt: str | None = None,
    timeout: Any = None,
) -> Any:
    """Suspend the workflow and wait for an external signal.

    Delegates to the signal function registered by the active runtime via
    :func:`set_context`. Each runtime implements its own pause/resume
    mechanism (DBOS messaging, asyncio Event, Temporal signals, etc.).
    """
    fn = _signal_var.get()
    if fn is None:
        raise RuntimeError(
            "No signal handler registered — the active runtime does not support "
            "wait_for_signal(), or set_context() was not called."
        )
    return await fn(name, prompt, timeout)
