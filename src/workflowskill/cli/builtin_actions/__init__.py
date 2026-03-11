"""Built-in actions provided by the CLI consumer (not by the workflowskill library)."""

from workflowskill.actions.registry import ActionRegistry
from workflowskill.cli.builtin_actions.llm import llm
from workflowskill.cli.builtin_actions.web_fetch import web_fetch, web_fetch_raw
from workflowskill.cli.builtin_actions.web_scrape import web_scrape

__all__ = ["llm", "web_fetch", "web_fetch_raw", "web_scrape"]


def register_builtin_actions(registry: ActionRegistry) -> None:
    """Register all built-in actions into an ActionRegistry."""
    registry.register("web_fetch", web_fetch)
    registry.register("web_fetch_raw", web_fetch_raw)
    registry.register("web_scrape", web_scrape)
    registry.register("llm", llm)
