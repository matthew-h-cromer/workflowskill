"""Unit tests for builtin_action and openclaw_action CLI commands."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from workflowskill.main import cli


async def _echo_handler(args: dict) -> dict:
    return {"echo": args}


def _make_mock_toolpack(handler: object) -> MagicMock:
    mock = MagicMock()

    def register(registry: object) -> None:
        from workflowskill.actions.registry import ActionRegistry

        assert isinstance(registry, ActionRegistry)
        registry.register("myaction", handler)

    mock.register.side_effect = register
    return mock


class TestBuiltinActionCommand:
    def test_basic_invocation(self) -> None:
        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_echo_handler)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["builtin_action", "myaction", '{"key": "val"}'])
        assert result.exit_code == 0, result.output
        data = json.loads(result.output)
        assert data == {"echo": {"key": "val"}}

    def test_invalid_json_args(self) -> None:
        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_echo_handler)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["builtin_action", "myaction", "not-json"])
        assert result.exit_code == 1

    def test_unknown_action(self) -> None:
        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_echo_handler)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["builtin_action", "unknown", "{}"])
        assert result.exit_code == 1

    def test_args_must_be_object(self) -> None:
        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_echo_handler)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["builtin_action", "myaction", '"just a string"'])
        assert result.exit_code == 1

    def test_handler_error_exits_nonzero(self) -> None:
        async def _failing(args: dict) -> dict:
            raise RuntimeError("action failed")

        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_failing)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["builtin_action", "myaction", "{}"])
        assert result.exit_code == 1


class TestOpencalwActionCommand:
    def test_basic_invocation(self) -> None:
        runner = CliRunner()
        mock_pack = _make_mock_toolpack(_echo_handler)
        with patch("workflowskill.toolpacks.load_toolpack", return_value=mock_pack):
            result = runner.invoke(cli, ["openclaw_action", "myaction", '{"x": 1}'])
        assert result.exit_code == 0, result.output
        data = json.loads(result.output)
        assert data == {"echo": {"x": 1}}
