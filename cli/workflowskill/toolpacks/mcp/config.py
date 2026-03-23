"""MCP server configuration — load and parse mcp.json."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class McpServerConfig:
    """Configuration for a single MCP server."""

    name: str
    command: str | None = None
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    url: str | None = None

    @property
    def is_stdio(self) -> bool:
        return self.command is not None

    @property
    def is_sse(self) -> bool:
        return self.url is not None


def _expand_env_vars(value: str) -> str:
    """Expand ${VAR} references from process environment."""
    return re.sub(r"\$\{([^}]+)\}", lambda m: os.environ.get(m.group(1), ""), value)


def load_mcp_config(path: Path | None = None) -> list[McpServerConfig]:
    """Load MCP server configurations from mcp.json.

    Args:
        path: Explicit path to mcp.json. Defaults to CWD/mcp.json.

    Returns:
        List of McpServerConfig objects. Empty list if file doesn't exist.
    """
    config_path = path or Path.cwd() / "mcp.json"
    if not config_path.exists():
        return []

    with open(config_path) as f:
        raw: dict[str, Any] = json.load(f)

    servers_raw = raw.get("mcpServers", {})
    if not isinstance(servers_raw, dict):
        raise ValueError("mcp.json: 'mcpServers' must be an object")

    configs: list[McpServerConfig] = []
    for name, server_def in servers_raw.items():
        if not isinstance(server_def, dict):
            raise ValueError(f"mcp.json: server '{name}' must be an object")

        # Expand env vars in the env dict
        raw_env = server_def.get("env", {})
        expanded_env = {k: _expand_env_vars(v) for k, v in raw_env.items()}

        config = McpServerConfig(
            name=name,
            command=server_def.get("command"),
            args=server_def.get("args", []),
            env=expanded_env,
            url=server_def.get("url"),
        )

        if not config.is_stdio and not config.is_sse:
            raise ValueError(
                f"mcp.json: server '{name}' must have either 'command' (stdio) or 'url' (SSE)"
            )

        configs.append(config)

    return configs
