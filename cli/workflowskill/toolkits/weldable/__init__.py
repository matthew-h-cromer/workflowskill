"""Weldable toolkit — routes workflow actions to the Weldable cloud platform."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import httpx


class WeldableToolkit:
    """Toolkit that routes any ``execute_activity()`` call to Weldable's REST API.

    Every action name (e.g. ``"slack.post_message"``, ``"web.fetch"``) is sent
    as the ``intent`` field to Weldable's ``/api/mcp/act`` endpoint. Weldable
    handles catalog matching, OAuth auth, and execution.

    Args:
        api_key: Bearer token from https://weldable.ai/app/agent-setup
        api_url: Base URL override (default: ``https://weldable.ai``).
    """

    name = "weldable"
    description = "Weldable cloud platform — authenticated integrations and workflow marketplace"
    homepage = "https://weldable.ai"

    def __init__(self, api_key: str, api_url: str = "https://weldable.ai") -> None:
        self._api_key = api_key
        self._api_url = api_url

    async def execute(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        """Route an action to Weldable's /api/mcp/act endpoint."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self._api_url}/api/mcp/act",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={"intent": action, "args": args},
            )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError(
                f"Expected dict response from Weldable API, got {type(data).__name__}"
            )
        result: dict[str, Any] = data

        status = result.get("status")
        if status == "complete":
            return cast(dict[str, Any], result.get("result", {}))
        elif status == "auth_required":
            connect_url = result.get("connect_url", f"{self._api_url}/app/integrations")
            raise RuntimeError(f"Integration not connected. Connect it at: {connect_url}")
        elif status == "needs_args":
            missing = result.get("missing", [])
            names = [p["name"] for p in missing]
            raise RuntimeError(f"Missing required arguments: {', '.join(names)}")
        elif status == "error":
            raise RuntimeError(result.get("message", "Unknown error from Weldable"))
        else:
            return result

    def get_authoring_context(self) -> str:
        """Return the Weldable action catalog for Claude authoring context."""
        return (Path(__file__).parent / "prompt.md").read_text()


def create_toolkit() -> WeldableToolkit:
    """Factory used by :func:`workflowskill.toolkits.load_toolkit`.

    Reads configuration from environment variables:

    - ``WELDABLE_API_KEY`` (required): Bearer token.
    - ``WELDABLE_API_URL`` (optional): Base URL override.

    Raises:
        RuntimeError: If ``WELDABLE_API_KEY`` is not set.
    """
    import os

    api_key = os.environ.get("WELDABLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "WELDABLE_API_KEY is required. Get one at https://weldable.ai/app/agent-setup"
        )
    api_url = os.environ.get("WELDABLE_API_URL", "https://weldable.ai")
    return WeldableToolkit(api_key=api_key, api_url=api_url)
