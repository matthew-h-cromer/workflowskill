"""Typed exceptions for toolkit execution failures."""

from __future__ import annotations


class ToolkitError(RuntimeError):
    """Base exception for all toolkit execution failures."""


class IntegrationNotConnectedError(ToolkitError):
    """Raised when an integration has not been authorized via OAuth.

    Args:
        message:     Human-readable error description (includes connect_url).
        connect_url: OAuth connect URL for the user to authorize the integration.
    """

    def __init__(self, message: str, *, connect_url: str = "") -> None:
        super().__init__(message)
        self.connect_url = connect_url
