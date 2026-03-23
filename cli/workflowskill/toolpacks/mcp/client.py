"""MCP client manager — connect to servers, discover tools, call tools."""

from __future__ import annotations

import asyncio
import contextlib
import os
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any

from workflowskill.toolpacks.mcp.config import McpServerConfig


@dataclass
class ToolInfo:
    """Lightweight tool descriptor from MCP discovery."""

    name: str
    description: str | None
    inputSchema: dict[str, Any] | None


class McpClientManager:
    """Manages connections to MCP servers for tool discovery and invocation."""

    def __init__(self, configs: list[McpServerConfig]) -> None:
        self._configs = {c.name: c for c in configs}
        self._sessions: dict[str, Any] = {}  # server_name -> ClientSession
        self._stacks: dict[str, AsyncExitStack] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def discover_all(self) -> dict[str, list[ToolInfo]]:
        """Connect to each server, list tools, then disconnect. One-shot discovery."""
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        result: dict[str, list[ToolInfo]] = {}

        for name, config in self._configs.items():
            if config.is_stdio:
                # Build env: merge process env with config env
                env = {**os.environ, **config.env} if config.env else None

                server_params = StdioServerParameters(
                    command=config.command,  # type: ignore[arg-type]
                    args=config.args,
                    env=env,
                )
                async with (
                    stdio_client(server_params) as (read_stream, write_stream),
                    ClientSession(read_stream, write_stream) as session,
                ):
                    await session.initialize()
                    tools_result = await session.list_tools()
                    result[name] = [
                        ToolInfo(
                            name=t.name,
                            description=t.description,
                            inputSchema=t.inputSchema,
                        )
                        for t in tools_result.tools
                    ]
            elif config.is_sse:
                from mcp.client.sse import sse_client

                async with (
                    sse_client(config.url) as (read_stream, write_stream),  # type: ignore[arg-type]
                    ClientSession(read_stream, write_stream) as session,
                ):
                    await session.initialize()
                    tools_result = await session.list_tools()
                    result[name] = [
                        ToolInfo(
                            name=t.name,
                            description=t.description,
                            inputSchema=t.inputSchema,
                        )
                        for t in tools_result.tools
                    ]

        return result

    async def _ensure_connected(self, server_name: str) -> Any:
        """Lazy-connect to a server and return its ClientSession."""
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        if server_name not in self._locks:
            self._locks[server_name] = asyncio.Lock()

        async with self._locks[server_name]:
            if server_name in self._sessions:
                return self._sessions[server_name]

            config = self._configs[server_name]
            stack = AsyncExitStack()
            self._stacks[server_name] = stack

            if config.is_stdio:
                env = {**os.environ, **config.env} if config.env else None
                server_params = StdioServerParameters(
                    command=config.command,  # type: ignore[arg-type]
                    args=config.args,
                    env=env,
                )
                transport = await stack.enter_async_context(stdio_client(server_params))
                read_stream, write_stream = transport
            elif config.is_sse:
                from mcp.client.sse import sse_client

                transport = await stack.enter_async_context(
                    sse_client(config.url)  # type: ignore[arg-type]
                )
                read_stream, write_stream = transport
            else:
                raise ValueError(f"Server '{server_name}' has no valid transport")

            session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
            await session.initialize()
            self._sessions[server_name] = session
            return session

    async def call_tool(self, server_name: str, tool_name: str, args: dict[str, Any]) -> Any:
        """Call a tool on the specified server. Lazy-connects if needed."""
        session = await self._ensure_connected(server_name)
        return await session.call_tool(tool_name, args)

    async def disconnect_all(self) -> None:
        """Disconnect from all servers."""
        for _name, stack in list(self._stacks.items()):
            with contextlib.suppress(Exception):
                await stack.aclose()
        self._sessions.clear()
        self._stacks.clear()
        self._locks.clear()
