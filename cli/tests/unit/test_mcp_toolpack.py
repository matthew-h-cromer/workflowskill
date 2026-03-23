"""Unit tests for MCP toolpack registration and authoring context."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from workflowskill.actions.registry import ActionRegistry
from workflowskill.toolpacks.mcp import McpToolPack
from workflowskill.toolpacks.mcp.client import ToolInfo
from workflowskill.toolpacks.mcp.config import McpServerConfig


def _make_tool(
    name: str, description: str = "", schema: dict[str, Any] | None = None
) -> ToolInfo:
    return ToolInfo(name=name, description=description, inputSchema=schema)


class TestMcpToolPack:
    def test_no_config_noop(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.chdir(tmp_path)
        pack = McpToolPack()
        registry = ActionRegistry()
        pack.register(registry)
        assert registry.names() == []

    @patch("workflowskill.toolpacks.mcp.client.McpClientManager")
    @patch("workflowskill.toolpacks.mcp.config.load_mcp_config")
    def test_registers_tools(self, mock_config: Any, mock_manager_cls: Any) -> None:
        mock_config.return_value = [McpServerConfig(name="srv", command="test")]
        mock_manager = mock_manager_cls.return_value
        mock_manager.discover_all = AsyncMock(
            return_value={
                "srv": [
                    _make_tool("tool_a", "does A"),
                    _make_tool("tool_b", "does B"),
                ]
            }
        )

        pack = McpToolPack()
        registry = ActionRegistry()
        pack.register(registry)

        assert registry.has("tool_a")
        assert registry.has("tool_b")
        assert sorted(registry.names()) == ["tool_a", "tool_b"]

    @patch("workflowskill.toolpacks.mcp.client.McpClientManager")
    @patch("workflowskill.toolpacks.mcp.config.load_mcp_config")
    def test_collision_raises(self, mock_config: Any, mock_manager_cls: Any) -> None:
        mock_config.return_value = [
            McpServerConfig(name="srv1", command="test1"),
            McpServerConfig(name="srv2", command="test2"),
        ]
        mock_manager = mock_manager_cls.return_value
        mock_manager.discover_all = AsyncMock(
            return_value={
                "srv1": [_make_tool("shared_tool")],
                "srv2": [_make_tool("shared_tool")],
            }
        )

        pack = McpToolPack()
        with pytest.raises(ValueError, match="shared_tool.*srv1.*srv2"):
            pack.register(ActionRegistry())

    @patch("workflowskill.toolpacks.mcp.client.McpClientManager")
    @patch("workflowskill.toolpacks.mcp.config.load_mcp_config")
    def test_authoring_context(self, mock_config: Any, mock_manager_cls: Any) -> None:
        mock_config.return_value = [McpServerConfig(name="srv", command="test")]
        mock_manager = mock_manager_cls.return_value
        mock_manager.discover_all = AsyncMock(
            return_value={
                "srv": [
                    _make_tool(
                        "read_file",
                        "Read a file",
                        {
                            "type": "object",
                            "properties": {
                                "path": {
                                    "type": "string",
                                    "description": "File path",
                                }
                            },
                            "required": ["path"],
                        },
                    )
                ]
            }
        )

        pack = McpToolPack()
        registry = ActionRegistry()
        pack.register(registry)

        context = pack.get_authoring_context()
        assert "`read_file`" in context
        assert "Read a file" in context
        assert "`path`" in context
        assert "(required)" in context

    def test_static_fallback_authoring_context(self) -> None:
        pack = McpToolPack()
        context = pack.get_authoring_context()
        assert "# Available Actions" in context
        assert "`read_file`" in context
        assert "`list_directory`" in context
