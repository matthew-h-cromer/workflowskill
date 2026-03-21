"""Integration test: run the hello-world example end-to-end."""

from pathlib import Path

import pytest

from workflowskill.actions.registry import ActionRegistry
from workflowskill.runner.runner import run_skill

EXAMPLES_DIR = Path(__file__).parent.parent.parent / "examples"


@pytest.mark.asyncio
async def test_hello_world() -> None:
    """hello-world.md should return {"message": "Hello, world!"} with no actions."""
    registry = ActionRegistry()
    result = await run_skill(EXAMPLES_DIR / "hello-world.md", registry=registry)
    assert result == {"message": "Hello, world!"}
