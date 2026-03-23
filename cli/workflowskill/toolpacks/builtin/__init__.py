"""Builtin tool pack — api, scrape, llm actions for the workflowskill CLI runtime."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflowskill.actions.registry import ActionRegistry

_PROMPT_MD = Path(__file__).parent / "prompt.md"


class BuiltinToolPack:
    name = "builtin"
    description = "Built-in actions for the workflowskill CLI: exec, api, scrape, llm"

    def register(self, registry: ActionRegistry) -> None:
        from workflowskill.actions.exec import exec_action
        from workflowskill.toolpacks.builtin.actions.api import api
        from workflowskill.toolpacks.builtin.actions.llm import llm
        from workflowskill.toolpacks.builtin.actions.scrape import scrape

        registry.register("exec", exec_action)
        registry.register("api", api)
        registry.register("scrape", scrape)
        registry.register("llm", llm)

    def get_authoring_context(self) -> str:
        return _PROMPT_MD.read_text()


toolpack = BuiltinToolPack()
