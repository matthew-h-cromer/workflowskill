"""MCP tool pack — dynamically discovered tools from configured MCP servers."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from workflowskill.actions.registry import ActionRegistry

_PROMPT_MD = Path(__file__).parent / "prompt.md"


class _ToolSchema:
    """Cached tool schema for authoring context generation."""

    def __init__(self, name: str, description: str, input_schema: dict[str, Any]) -> None:
        self.name = name
        self.description = description
        self.input_schema = input_schema


class McpToolPack:
    name = "mcp"
    description = "MCP server tools — dynamically discovered from configured MCP servers"

    def __init__(self) -> None:
        self._tool_schemas: list[_ToolSchema] = []
        self._manager: Any = None

    def register(self, registry: ActionRegistry) -> None:
        from workflowskill.toolpacks.mcp.actions import make_mcp_handler
        from workflowskill.toolpacks.mcp.client import McpClientManager
        from workflowskill.toolpacks.mcp.config import load_mcp_config

        configs = load_mcp_config()
        if not configs:
            return

        self._manager = McpClientManager(configs)

        # One-shot discovery: connect, list tools, disconnect for each server.
        # Safe to use asyncio.run() here — called before the main event loop starts.
        tools_by_server = asyncio.run(self._manager.discover_all())

        # Check for tool name collisions across servers
        seen: dict[str, str] = {}  # tool_name -> server_name
        for server_name, tools in tools_by_server.items():
            for tool in tools:
                if tool.name in seen:
                    raise ValueError(
                        f"MCP tool '{tool.name}' found in servers "
                        f"'{seen[tool.name]}' and '{server_name}'. "
                        f"Remove one from mcp.json to resolve the collision."
                    )
                seen[tool.name] = server_name
                handler = make_mcp_handler(self._manager, server_name, tool.name)
                registry.register(tool.name, handler)
                self._tool_schemas.append(
                    _ToolSchema(
                        name=tool.name,
                        description=tool.description or "",
                        input_schema=tool.inputSchema or {},
                    )
                )

    def get_authoring_context(self) -> str:
        if self._tool_schemas:
            return self._generate_dynamic_context()
        # Static fallback (for evals and documentation)
        return _PROMPT_MD.read_text()

    def _generate_dynamic_context(self) -> str:
        lines: list[str] = []
        lines.append("## MCP Tools\n")
        lines.append("The following tools are available from configured MCP servers:\n")

        for tool in self._tool_schemas:
            lines.append(f"### `{tool.name}`\n")
            if tool.description:
                lines.append(f"{tool.description}\n")
            if tool.input_schema and isinstance(tool.input_schema, dict):
                props = tool.input_schema.get("properties", {})
                required = set(tool.input_schema.get("required", []))
                if props:
                    lines.append("**Parameters:**\n")
                    for prop_name, prop_def in props.items():
                        prop_type = prop_def.get("type", "any")
                        prop_desc = prop_def.get("description", "")
                        req = " (required)" if prop_name in required else ""
                        lines.append(f"- `{prop_name}` ({prop_type}{req}): {prop_desc}")
                    lines.append("")

        return "\n".join(lines)


toolpack = McpToolPack()
