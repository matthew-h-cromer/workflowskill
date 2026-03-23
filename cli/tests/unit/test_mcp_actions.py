"""Unit tests for MCP result normalization and handler factory."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock

import pytest

from workflowskill.toolpacks.mcp.actions import make_mcp_handler, normalize_mcp_result


@dataclass
class FakeTextContent:
    text: str
    type: str = "text"


@dataclass
class FakeImageContent:
    data: str
    type: str = "image"


@dataclass
class FakeCallToolResult:
    content: list[Any] = field(default_factory=list)
    isError: bool = False


class TestNormalizeMcpResult:
    def test_single_text_json(self) -> None:
        result = FakeCallToolResult(
            content=[FakeTextContent(text='{"key": "value"}')]
        )
        assert normalize_mcp_result(result) == {"key": "value"}

    def test_single_text_json_non_dict(self) -> None:
        result = FakeCallToolResult(content=[FakeTextContent(text="[1, 2, 3]")])
        assert normalize_mcp_result(result) == {"content": [1, 2, 3]}

    def test_single_text_plain(self) -> None:
        result = FakeCallToolResult(content=[FakeTextContent(text="hello world")])
        assert normalize_mcp_result(result) == {"content": "hello world"}

    def test_multiple_blocks(self) -> None:
        result = FakeCallToolResult(
            content=[
                FakeTextContent(text="first"),
                FakeTextContent(text="second"),
            ]
        )
        normalized = normalize_mcp_result(result)
        assert isinstance(normalized["content"], list)
        assert len(normalized["content"]) == 2
        assert normalized["content"][0] == {"type": "text", "text": "first"}
        assert normalized["content"][1] == {"type": "text", "text": "second"}

    def test_error_raises_runtime_error(self) -> None:
        result = FakeCallToolResult(
            content=[FakeTextContent(text="something went wrong")],
            isError=True,
        )
        with pytest.raises(RuntimeError, match="something went wrong"):
            normalize_mcp_result(result)

    def test_error_no_text_raises_generic(self) -> None:
        result = FakeCallToolResult(content=[], isError=True)
        with pytest.raises(RuntimeError, match="MCP tool returned an error"):
            normalize_mcp_result(result)

    def test_non_text_single_block(self) -> None:
        result = FakeCallToolResult(content=[FakeImageContent(data="base64data")])
        normalized = normalize_mcp_result(result)
        assert normalized["content"]["type"] == "image"
        assert normalized["content"]["data"] == "base64data"


class TestMakeMcpHandler:
    @pytest.mark.asyncio
    async def test_handler_calls_manager_and_normalizes(self) -> None:
        manager = AsyncMock()
        manager.call_tool.return_value = FakeCallToolResult(
            content=[FakeTextContent(text='{"result": "ok"}')]
        )

        handler = make_mcp_handler(manager, "test-server", "my_tool")
        result = await handler({"arg1": "val1"})

        manager.call_tool.assert_called_once_with("test-server", "my_tool", {"arg1": "val1"})
        assert result == {"result": "ok"}

    @pytest.mark.asyncio
    async def test_handler_metadata(self) -> None:
        manager = AsyncMock()
        handler = make_mcp_handler(manager, "srv", "do_thing")
        assert handler.__name__ == "mcp_do_thing"
        assert "srv" in (handler.__doc__ or "")

    @pytest.mark.asyncio
    async def test_handler_propagates_error(self) -> None:
        manager = AsyncMock()
        manager.call_tool.return_value = FakeCallToolResult(
            content=[FakeTextContent(text="fail")], isError=True
        )

        handler = make_mcp_handler(manager, "srv", "broken_tool")
        with pytest.raises(RuntimeError, match="fail"):
            await handler({})
