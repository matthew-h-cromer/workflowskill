"""Integration test: run the echo-test example end-to-end."""

from pathlib import Path

import pytest

from workflowskill.actions.registry import ActionRegistry
from workflowskill.runner.runner import run_skill
from workflowskill.toolpacks import load_toolpack

EXAMPLES_DIR = Path(__file__).parent.parent.parent.parent / "examples"


@pytest.mark.asyncio
async def test_exec_echo() -> None:
    """echo-test.md should run a shell command and return its output."""
    registry = ActionRegistry()
    pack = load_toolpack("builtin")
    pack.register(registry)
    result = await run_skill(EXAMPLES_DIR / "builtin" / "echo-test.md", registry=registry)
    assert "hello from exec" in result["output"]
    assert result["exit_code"] == 0
