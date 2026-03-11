"""WorkflowSkill — Temporal-based workflow engine for agent automation.

Public API:

    ActionRegistry      Register platform tools as Temporal activities.
    run_skill           Load and execute a SKILL.md workflow.
    LoadedSkill         Parsed SKILL.md ready for execution.
    SkillLoadError      Raised when a SKILL.md cannot be loaded.
    InputSpec           Specification for a single workflow input.
    OutputSpec          Specification for a single workflow output.

Example::

    import asyncio
    from workflowskill import ActionRegistry, run_skill

    registry = ActionRegistry()
    registry.register("my_tool", my_handler)

    result = asyncio.run(run_skill("path/to/skill.md", {"query": "hello"}, registry))
    print(result)
"""

from workflowskill.actions.registry import ActionRegistry
from workflowskill.loader.skill_loader import (
    InputSpec,
    LoadedSkill,
    OutputSpec,
    SkillLoadError,
    load_skill,
)
from workflowskill.runner.runner import run_skill

__all__ = [
    "ActionRegistry",
    "InputSpec",
    "LoadedSkill",
    "OutputSpec",
    "SkillLoadError",
    "load_skill",
    "run_skill",
]
