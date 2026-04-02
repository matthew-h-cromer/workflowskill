"""Integration test: run the hello-world fixture end-to-end."""

from pathlib import Path

import pytest

from workflowskill.runner.runner import run_skill

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.mark.asyncio
async def test_hello_world() -> None:
    """hello-world.md should return {"message": "Hello, world!"} with no toolkit."""
    result = await run_skill(FIXTURES_DIR / "hello-world.md")
    assert result == {"message": "Hello, world!"}
