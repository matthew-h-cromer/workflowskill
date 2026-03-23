"""MCP action handler factory and result normalization."""

from __future__ import annotations

import json
from typing import Any

from workflowskill.toolpacks.mcp.client import McpClientManager


def normalize_mcp_result(result: Any) -> dict[str, Any]:
    """Normalize an MCP CallToolResult into a plain dict.

    Rules:
    - isError=True -> raise RuntimeError with the text content
    - Single TextContent that parses as JSON -> return parsed dict
    - Single TextContent (not JSON) -> {"content": text}
    - Multiple content blocks -> {"content": [{"type": ..., ...}, ...]}
    """
    if result.isError:
        error_texts = []
        for block in result.content:
            if hasattr(block, "text"):
                error_texts.append(block.text)
        raise RuntimeError(" ".join(error_texts) if error_texts else "MCP tool returned an error")

    if len(result.content) == 1:
        block = result.content[0]
        if hasattr(block, "text"):
            try:
                parsed = json.loads(block.text)
                if isinstance(parsed, dict):
                    return parsed
                return {"content": parsed}
            except (json.JSONDecodeError, TypeError):
                return {"content": block.text}
        return {"content": _serialize_block(block)}

    return {"content": [_serialize_block(b) for b in result.content]}


def _serialize_block(block: Any) -> Any:
    """Serialize an MCP content block to a JSON-friendly dict."""
    if hasattr(block, "text"):
        return {"type": "text", "text": block.text}
    if hasattr(block, "data"):
        return {"type": getattr(block, "type", "blob"), "data": block.data}
    return {"type": "unknown", "value": str(block)}


def make_mcp_handler(manager: McpClientManager, server_name: str, tool_name: str) -> Any:
    """Create an async handler for a specific MCP tool.

    Returns an async function matching the ActionRegistry handler signature:
    async def handler(args: dict) -> dict
    """

    async def handler(args: dict[str, Any]) -> dict[str, Any]:
        result = await manager.call_tool(server_name, tool_name, args)
        return normalize_mcp_result(result)

    handler.__name__ = f"mcp_{tool_name}"
    handler.__qualname__ = f"mcp_{tool_name}"
    handler.__doc__ = f"MCP tool: {tool_name} (server: {server_name})"

    return handler
