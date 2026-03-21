"""Tool packs — ecosystem-specific action sets for authoring and running workflows."""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from workflowskill.actions.registry import ActionRegistry

_REGISTRY: dict[str, str] = {
    "builtin": "workflowskill.toolpacks.builtin",
    "openclaw": "workflowskill.toolpacks.openclaw",
}


@runtime_checkable
class ToolPack(Protocol):
    """A self-contained set of actions for a specific ecosystem."""

    name: str
    description: str

    def register(self, registry: ActionRegistry) -> None:
        """Register all action handlers into the given registry."""
        ...

    def get_authoring_context(self) -> str:
        """Return the markdown fragment describing available tools for LLM authoring."""
        ...


def load_toolpack(name: str) -> Any:
    """Load and return a ToolPack instance by name."""
    if name not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unknown toolpack: {name!r}. Available: {available}")
    module = importlib.import_module(_REGISTRY[name])
    return module.toolpack


def available_toolpacks() -> list[str]:
    """Return the list of registered toolpack names."""
    return sorted(_REGISTRY)
