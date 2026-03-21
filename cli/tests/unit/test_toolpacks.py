"""Unit tests for the toolpack system and individual action handlers."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── ToolPack registry ──────────────────────────────────────────────────────────

class TestToolPackRegistry:
    def test_load_builtin(self) -> None:
        from workflowskill.toolpacks import load_toolpack
        pack = load_toolpack("builtin")
        assert pack.name == "builtin"

    def test_load_openclaw(self) -> None:
        from workflowskill.toolpacks import load_toolpack
        pack = load_toolpack("openclaw")
        assert pack.name == "openclaw"

    def test_load_unknown_raises(self) -> None:
        from workflowskill.toolpacks import load_toolpack
        with pytest.raises(ValueError, match="Unknown toolpack"):
            load_toolpack("nonexistent")

    def test_available_toolpacks(self) -> None:
        from workflowskill.toolpacks import available_toolpacks
        packs = available_toolpacks()
        assert "builtin" in packs
        assert "openclaw" in packs

    def test_builtin_registers_expected_actions(self) -> None:
        from workflowskill.actions.registry import ActionRegistry
        from workflowskill.toolpacks import load_toolpack
        registry = ActionRegistry()
        pack = load_toolpack("builtin")
        pack.register(registry)
        assert registry.has("api")
        assert registry.has("scrape")
        assert registry.has("llm")

    def test_openclaw_registers_expected_actions(self) -> None:
        from workflowskill.actions.registry import ActionRegistry
        from workflowskill.toolpacks import load_toolpack
        registry = ActionRegistry()
        pack = load_toolpack("openclaw")
        pack.register(registry)
        assert registry.has("exec")
        assert registry.has("browser")
        assert registry.has("web_search")
        assert registry.has("web_fetch")
        assert registry.has("llm_task")
        assert registry.has("read")
        assert registry.has("write")
        assert registry.has("edit")

    def test_get_authoring_context_returns_string(self) -> None:
        from workflowskill.toolpacks import load_toolpack
        for name in ("builtin", "openclaw"):
            pack = load_toolpack(name)
            ctx = pack.get_authoring_context()
            assert isinstance(ctx, str)
            assert len(ctx) > 100


# ── exec action ────────────────────────────────────────────────────────────────

class TestExecAction:
    async def test_basic_command(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        result = await exec_action({"command": "echo hello"})
        assert "hello" in result["output"]
        assert result["exit_code"] == 0
        assert result["status"] == "done"

    async def test_failing_command(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        result = await exec_action({"command": "exit 1", "timeout": 5})
        assert result["exit_code"] != 0
        assert result["status"] == "error"

    async def test_env_vars(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        result = await exec_action({
            "command": "echo $MY_TEST_VAR",
            "env": {"MY_TEST_VAR": "hello_from_env"},
        })
        assert "hello_from_env" in result["output"]

    async def test_workdir(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        with tempfile.TemporaryDirectory() as tmpdir:
            result = await exec_action({"command": "pwd", "workdir": tmpdir})
            assert tmpdir in result["output"]

    async def test_missing_command_raises(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        with pytest.raises(ValueError, match="command"):
            await exec_action({})

    async def test_timeout(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        result = await exec_action({"command": "sleep 10", "timeout": 0.1})
        assert result["status"] == "error"
        assert "timed out" in result["output"]


# ── web_fetch action ────────────────────────────────────────────────────────────

class TestWebFetchAction:
    async def test_fetches_html(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_fetch import web_fetch

        mock_response = MagicMock()
        mock_response.text = "<html><body><h1>Hello</h1><p>World</p></body></html>"
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "text/html"}

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)

            result = await web_fetch({"url": "https://example.com"})

        assert "Hello" in result["content"]
        assert result["status"] == 200
        assert result["url"] == "https://example.com"

    async def test_truncation(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_fetch import web_fetch

        long_content = "x" * 200
        mock_response = MagicMock()
        mock_response.text = long_content
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)

            result = await web_fetch({"url": "https://example.com", "maxChars": 100})

        assert len(result["content"]) < 200
        assert "truncated" in result["content"]

    async def test_missing_url_raises(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_fetch import web_fetch
        with pytest.raises(ValueError, match="url"):
            await web_fetch({})


# ── web_search action ───────────────────────────────────────────────────────────

class TestWebSearchAction:
    async def test_requires_api_key(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_search import web_search
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("BRAVE_API_KEY", None)
            with pytest.raises(ValueError, match="BRAVE_API_KEY"):
                await web_search({"query": "test"})

    async def test_search_results(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_search import web_search

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "web": {
                "results": [
                    {"title": "Result 1", "url": "https://example.com/1", "description": "Desc 1"},
                    {"title": "Result 2", "url": "https://example.com/2", "description": "Desc 2"},
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
                mock_client.get = AsyncMock(return_value=mock_response)

                result = await web_search({"query": "test query", "count": 2})

        assert result["query"] == "test query"
        assert len(result["results"]) == 2
        assert result["results"][0]["title"] == "Result 1"

    async def test_missing_query_raises(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.web_search import web_search
        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
            with pytest.raises(ValueError, match="query"):
                await web_search({})


# ── llm_task action ─────────────────────────────────────────────────────────────

class TestLlmTaskAction:
    async def test_basic_call(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.llm_task import llm_task, set_client

        mock_client = AsyncMock()
        mock_message = MagicMock()
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = '{"result": "hello"}'
        mock_message.content = [mock_block]
        mock_client.messages.create = AsyncMock(return_value=mock_message)

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
            set_client(mock_client)
            result = await llm_task({"prompt": "Say hello"})

        assert result == {"result": "hello"}

    async def test_with_input_data(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.llm_task import llm_task, set_client

        captured_messages: list[Any] = []

        mock_client = AsyncMock()
        mock_message = MagicMock()
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = '{"sentiment": "positive"}'
        mock_message.content = [mock_block]

        async def capture_create(**kwargs: Any) -> Any:
            captured_messages.append(kwargs["messages"])
            return mock_message

        mock_client.messages.create = capture_create

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
            set_client(mock_client)
            await llm_task({"prompt": "Classify sentiment", "input": {"text": "Great product!"}})

        assert captured_messages
        content = captured_messages[0][0]["content"]
        assert "Input data" in content
        assert "Great product!" in content

    async def test_missing_api_key(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.llm_task import llm_task
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("ANTHROPIC_API_KEY", None)
            with pytest.raises(Exception, match="ANTHROPIC_API_KEY"):
                await llm_task({"prompt": "test"})


# ── file_ops actions ────────────────────────────────────────────────────────────

class TestFileOpsActions:
    async def test_write_and_read(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import read, write

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "test.txt")
            write_result = await write({"path": path, "content": "hello world"})
            assert write_result["created"] is True
            assert write_result["size"] == len("hello world")

            read_result = await read({"path": path})
            assert read_result["content"] == "hello world"

    async def test_write_creates_parents(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import write

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "a" / "b" / "c" / "test.txt")
            result = await write({"path": path, "content": "nested"})
            assert result["created"] is True
            assert Path(path).exists()

    async def test_edit_replaces_string(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import edit, write

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "edit_test.txt")
            await write({"path": path, "content": "hello world hello"})

            result = await edit({"path": path, "old_string": "hello", "new_string": "goodbye"})
            assert result["replacements"] == 1

            from workflowskill.toolpacks.openclaw.actions.file_ops import read
            content = (await read({"path": path}))["content"]
            assert content == "goodbye world hello"

    async def test_edit_replace_all(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import edit, read, write

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "edit_all.txt")
            await write({"path": path, "content": "foo foo foo"})

            result = await edit({
                "path": path,
                "old_string": "foo",
                "new_string": "bar",
                "replace_all": True,
            })
            assert result["replacements"] == 3

            content = (await read({"path": path}))["content"]
            assert content == "bar bar bar"

    async def test_read_missing_file_raises(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import read
        with pytest.raises(ValueError, match="not found"):
            await read({"path": "/nonexistent/path/file.txt"})

    async def test_edit_missing_string_raises(self) -> None:
        from workflowskill.toolpacks.openclaw.actions.file_ops import edit, write

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "test.txt")
            await write({"path": path, "content": "hello"})

            with pytest.raises(ValueError, match="not found"):
                await edit({"path": path, "old_string": "xyz", "new_string": "abc"})
