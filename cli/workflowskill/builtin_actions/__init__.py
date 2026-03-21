"""Built-in actions provided by the CLI consumer (not by the workflowskill library)."""

from workflowskill.actions.registry import ActionRegistry
from workflowskill.builtin_actions.api import api
from workflowskill.builtin_actions.llm import llm
from workflowskill.builtin_actions.scrape import scrape

__all__ = ["api", "llm", "scrape"]


def register_builtin_actions(registry: ActionRegistry) -> None:
    """Register all built-in actions into an ActionRegistry."""
    registry.register("api", api)
    registry.register("scrape", scrape)
    registry.register("llm", llm)
