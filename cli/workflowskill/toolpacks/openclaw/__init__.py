"""OpenClaw tool pack — exec, browser, web_search, web_fetch, llm_task, read, write, edit."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflowskill.actions.registry import ActionRegistry

_PROMPT_MD = Path(__file__).parent / "prompt.md"


class OpenClawToolPack:
    name = "openclaw"
    description = (
        "OpenClaw ecosystem tools: exec, browser, web_search, web_fetch, "
        "llm_task, read, write, edit"
    )

    def register(self, registry: ActionRegistry) -> None:
        from workflowskill.toolpacks.openclaw.actions.browser import browser
        from workflowskill.toolpacks.openclaw.actions.exec import exec_action
        from workflowskill.toolpacks.openclaw.actions.file_ops import edit, read, write
        from workflowskill.toolpacks.openclaw.actions.llm_task import llm_task
        from workflowskill.toolpacks.openclaw.actions.web_fetch import web_fetch
        from workflowskill.toolpacks.openclaw.actions.web_search import web_search

        registry.register("exec", exec_action)
        registry.register("browser", browser)
        registry.register("web_search", web_search)
        registry.register("web_fetch", web_fetch)
        registry.register("llm_task", llm_task)
        registry.register("read", read)
        registry.register("write", write)
        registry.register("edit", edit)

    def get_authoring_context(self) -> str:
        return _PROMPT_MD.read_text()


toolpack = OpenClawToolPack()
