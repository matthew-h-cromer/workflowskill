"""Toolkits — platform-specific action execution integrations for workflowskill."""

from __future__ import annotations

from workflowskill._plugin_loader import load_plugin
from workflowskill.toolkits._protocol import Toolkit

_REGISTRY: dict[str, str] = {
    "weldable": "workflowskill.toolkits.weldable",
}


def load_toolkit(name: str) -> Toolkit:
    """Load and instantiate a toolkit by name.

    Each toolkit module exposes a ``create_toolkit()`` factory that reads
    any required configuration (e.g. API keys from environment variables)
    and returns a configured :class:`Toolkit` instance.

    Args:
        name: Toolkit name, e.g. ``"weldable"``.

    Raises:
        ValueError:     If the toolkit name is not registered.
        RuntimeError:   If required configuration (e.g. API key) is missing.
    """
    toolkit: Toolkit = load_plugin(_REGISTRY, name, "toolkit", "create_toolkit")
    return toolkit


def available_toolkits() -> list[str]:
    """Return the list of registered toolkit names."""
    return sorted(_REGISTRY)


__all__ = ["Toolkit", "load_toolkit", "available_toolkits"]
