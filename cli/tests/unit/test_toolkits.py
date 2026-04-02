"""Unit tests for the toolkit system."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from workflowskill.toolkits._protocol import Toolkit


# ── Toolkit loader ────────────────────────────────────────────────────────────


class TestToolkitLoader:
    def test_load_weldable(self) -> None:
        with patch.dict("os.environ", {"WELDABLE_API_KEY": "wld_test"}):
            from workflowskill.toolkits import load_toolkit

            toolkit = load_toolkit("weldable")
            assert toolkit.name == "weldable"

    def test_load_unknown_raises(self) -> None:
        from workflowskill.toolkits import load_toolkit

        with pytest.raises(ValueError, match="Unknown toolkit"):
            load_toolkit("nonexistent")

    def test_available_toolkits(self) -> None:
        from workflowskill.toolkits import available_toolkits

        kits = available_toolkits()
        assert "weldable" in kits

    def test_load_missing_api_key_raises(self) -> None:
        from workflowskill.toolkits import load_toolkit

        with patch.dict("os.environ", {}, clear=True):
            import os

            os.environ.pop("WELDABLE_API_KEY", None)
            with pytest.raises(RuntimeError, match="WELDABLE_API_KEY"):
                load_toolkit("weldable")


# ── Toolkit Protocol compliance ───────────────────────────────────────────────


class TestWeldableProtocol:
    def _make_toolkit(self) -> object:
        from workflowskill.toolkits.weldable import WeldableToolkit

        return WeldableToolkit(api_key="wld_test")

    def test_implements_toolkit_protocol(self) -> None:
        toolkit = self._make_toolkit()
        assert isinstance(toolkit, Toolkit)

    def test_required_attributes(self) -> None:
        toolkit = self._make_toolkit()
        assert toolkit.name == "weldable"
        assert toolkit.description
        assert toolkit.homepage

    def test_get_authoring_context_returns_string(self) -> None:
        toolkit = self._make_toolkit()
        ctx = toolkit.get_authoring_context()
        assert isinstance(ctx, str)
        assert len(ctx) > 100
        assert "weldable_act" in ctx
        assert "needs_args" in ctx


# ── WeldableToolkit.execute() ─────────────────────────────────────────────────


class TestWeldableExecute:
    def _make_toolkit(self) -> object:
        from workflowskill.toolkits.weldable import WeldableToolkit

        return WeldableToolkit(api_key="wld_test")

    def _patch_client(self, response_data: dict) -> patch:
        """Return a patch that makes httpx.AsyncClient return a mock with the given response."""
        mock_response = MagicMock()
        mock_response.json.return_value = response_data
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        return patch("workflowskill.toolkits.weldable.httpx.AsyncClient", return_value=mock_client)

    @pytest.mark.asyncio
    async def test_execute_complete(self) -> None:
        toolkit = self._make_toolkit()
        with self._patch_client({"status": "complete", "result": {"ts": "123"}}):
            result = await toolkit.execute("slack.post_message", {"channel": "#test", "text": "hi"})
        assert result == {"ts": "123"}

    @pytest.mark.asyncio
    async def test_execute_auth_required_raises(self) -> None:
        toolkit = self._make_toolkit()
        with self._patch_client(
            {"status": "auth_required", "connect_url": "https://weldable.ai/connect"}
        ):
            with pytest.raises(RuntimeError, match="Connect it at"):
                await toolkit.execute("slack.post_message", {})

    @pytest.mark.asyncio
    async def test_execute_needs_args_raises(self) -> None:
        toolkit = self._make_toolkit()
        with self._patch_client(
            {"status": "needs_args", "missing": [{"name": "channel"}]}
        ):
            with pytest.raises(RuntimeError, match="channel"):
                await toolkit.execute("slack.post_message", {})

    @pytest.mark.asyncio
    async def test_execute_error_raises(self) -> None:
        toolkit = self._make_toolkit()
        with self._patch_client({"status": "error", "message": "boom"}):
            with pytest.raises(RuntimeError, match="boom"):
                await toolkit.execute("slack.post_message", {})

    @pytest.mark.asyncio
    async def test_creates_fresh_client_per_request(self) -> None:
        """Each execute() call creates a fresh httpx.AsyncClient."""
        toolkit = self._make_toolkit()

        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "complete", "result": {}}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch(
            "workflowskill.toolkits.weldable.httpx.AsyncClient",
            return_value=mock_client,
        ) as mock_cls:
            await toolkit.execute("a", {})
            await toolkit.execute("b", {})

            # Constructor called once per request
            assert mock_cls.call_count == 2
            assert mock_client.post.call_count == 2
