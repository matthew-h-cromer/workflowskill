"""Weldable toolkit — routes workflow actions to the Weldable cloud platform."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import httpx

from workflowskill.errors import IntegrationNotConnectedError, ToolkitError


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
        from urllib.parse import urlparse

        parsed = urlparse(self._api_url)
        is_local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
        async with httpx.AsyncClient(timeout=60.0, verify=not is_local) as client:
            response = await client.post(
                f"{self._api_url}/api/mcp/act",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={"intent": action, "args": args},
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ToolkitError(
                f"Weldable API returned HTTP {e.response.status_code} for action '{action}'"
            ) from e
        data = response.json()
        if not isinstance(data, dict):
            raise ToolkitError(
                f"Expected dict response from Weldable API, got {type(data).__name__}"
            )
        result: dict[str, Any] = data

        status = result.get("status")
        if status == "executed":
            return cast(dict[str, Any], result.get("result", {}))
        elif status in ("auth_required", "matched"):
            connect_url = result.get("connect_url", f"{self._api_url}/app/integrations")
            raise IntegrationNotConnectedError(
                f"Integration not connected. Connect it at: {connect_url}",
                connect_url=connect_url,
            )
        elif status == "needs_args":
            missing = result.get("missing", [])
            names = [p["name"] for p in missing]
            raise ToolkitError(f"Missing required arguments for '{action}': {', '.join(names)}")
        elif status == "error":
            raise ToolkitError(result.get("message", "Unknown error from Weldable"))
        else:
            raise ToolkitError(f"Unexpected status '{status}' from Weldable for action '{action}'")

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
