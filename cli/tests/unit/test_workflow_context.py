"""Unit tests for the workflow execution context."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflowskill.workflow_context import (
    dispatch_action,
    reset_context,
    set_context,
    wait_for_signal,
)


@pytest.mark.asyncio
async def test_dispatch_without_context_raises() -> None:
    with pytest.raises(RuntimeError, match="No workflow execution context"):
        await dispatch_action("api", {}, 0, "api")


@pytest.mark.asyncio
async def test_signal_without_context_raises() -> None:
    with pytest.raises(RuntimeError, match="No signal handler"):
        await wait_for_signal("approval")


@pytest.mark.asyncio
async def test_dispatch_calls_provided_function() -> None:
    mock_dispatch = AsyncMock(return_value={"ok": True})
    tokens = set_context(mock_dispatch)
    try:
        result = await dispatch_action("api", {"url": "https://x.com"}, 0, "api")
        assert result == {"ok": True}
        mock_dispatch.assert_called_once_with("api", {"url": "https://x.com"}, 0, "api")
    finally:
        reset_context(tokens)


@pytest.mark.asyncio
async def test_reset_context_restores_previous_state() -> None:
    mock_dispatch = AsyncMock(return_value={})
    tokens = set_context(mock_dispatch)
    reset_context(tokens)
    with pytest.raises(RuntimeError, match="No workflow execution context"):
        await dispatch_action("api", {}, 0, "api")
