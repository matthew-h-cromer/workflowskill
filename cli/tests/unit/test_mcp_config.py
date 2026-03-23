"""Unit tests for MCP config parsing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from workflowskill.toolpacks.mcp.config import (
    McpServerConfig,
    _expand_env_vars,
    load_mcp_config,
)


class TestExpandEnvVars:
    def test_expands_known_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MY_TOKEN", "secret123")
        assert _expand_env_vars("${MY_TOKEN}") == "secret123"

    def test_expands_unknown_var_to_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("NONEXISTENT_VAR", raising=False)
        assert _expand_env_vars("${NONEXISTENT_VAR}") == ""

    def test_expands_multiple_vars(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("A", "hello")
        monkeypatch.setenv("B", "world")
        assert _expand_env_vars("${A}-${B}") == "hello-world"

    def test_no_vars_unchanged(self) -> None:
        assert _expand_env_vars("plain text") == "plain text"

    def test_partial_var_syntax_unchanged(self) -> None:
        assert _expand_env_vars("$NOT_A_VAR") == "$NOT_A_VAR"


class TestLoadMcpConfig:
    def test_missing_file_returns_empty(self, tmp_path: Path) -> None:
        configs = load_mcp_config(tmp_path / "nonexistent.json")
        assert configs == []

    def test_stdio_server(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "myserver": {
                            "command": "npx",
                            "args": ["-y", "some-server"],
                        }
                    }
                }
            )
        )
        configs = load_mcp_config(config_file)
        assert len(configs) == 1
        assert configs[0].name == "myserver"
        assert configs[0].command == "npx"
        assert configs[0].args == ["-y", "some-server"]
        assert configs[0].is_stdio
        assert not configs[0].is_sse

    def test_sse_server(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "remote": {"url": "http://localhost:8080/sse"}
                    }
                }
            )
        )
        configs = load_mcp_config(config_file)
        assert len(configs) == 1
        assert configs[0].name == "remote"
        assert configs[0].url == "http://localhost:8080/sse"
        assert configs[0].is_sse
        assert not configs[0].is_stdio

    def test_env_expansion(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GH_TOKEN", "tok_abc")
        config_file = tmp_path / "mcp.json"
        config_file.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "gh": {
                            "command": "npx",
                            "args": ["-y", "gh-server"],
                            "env": {"GITHUB_TOKEN": "${GH_TOKEN}"},
                        }
                    }
                }
            )
        )
        configs = load_mcp_config(config_file)
        assert configs[0].env == {"GITHUB_TOKEN": "tok_abc"}

    def test_multiple_servers(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "a": {"command": "server-a"},
                        "b": {"url": "http://b/sse"},
                    }
                }
            )
        )
        configs = load_mcp_config(config_file)
        assert len(configs) == 2
        names = {c.name for c in configs}
        assert names == {"a", "b"}

    def test_invalid_server_no_transport(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(
            json.dumps({"mcpServers": {"bad": {"env": {"X": "Y"}}}})
        )
        with pytest.raises(ValueError, match="must have either 'command'"):
            load_mcp_config(config_file)

    def test_invalid_mcpServers_type(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(json.dumps({"mcpServers": "not-an-object"}))
        with pytest.raises(ValueError, match="must be an object"):
            load_mcp_config(config_file)

    def test_empty_mcpServers(self, tmp_path: Path) -> None:
        config_file = tmp_path / "mcp.json"
        config_file.write_text(json.dumps({"mcpServers": {}}))
        configs = load_mcp_config(config_file)
        assert configs == []
