"""Unit tests for the skill runner."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from workflowskill.loader.skill_loader import InputSpec, LoadedSkill, OutputSpec
from workflowskill.runner.runner import run_skill


def _make_loaded_skill(
    *,
    inputs: dict | None = None,
    outputs: dict | None = None,
    run_returns: object = None,
    run_params: list[str] | None = None,
) -> LoadedSkill:
    """Build a LoadedSkill with a mock workflow class."""
    if run_returns is None:
        run_returns = {"result": "ok"}

    # Build a real class so inspect.signature works on .run()
    if run_params:
        params = ", ".join(run_params)
        exec_ns: dict = {}
        exec(  # noqa: S102 — test helper only
            f"async def run(self, {params}): return _ret",
            {"_ret": run_returns},
            exec_ns,
        )
        cls = type("TestWorkflow", (), {"run": exec_ns["run"]})
    else:
        async def _run(self):  # type: ignore[override]
            return run_returns

        cls = type("TestWorkflow", (), {"run": _run})

    return LoadedSkill(
        name="test",
        description="test workflow",
        workflow_class=cls,
        inputs=inputs or {},
        outputs=outputs or {},
        actions=[],
    )


def _mock_runtime() -> AsyncMock:
    """Return a mock runtime that executes the workflow function."""
    rt = AsyncMock()

    async def _run_workflow(fn, inputs, *, workflow_id=None):  # type: ignore[no-untyped-def]
        return await fn(**inputs)

    rt.run_workflow = _run_workflow
    return rt


class TestRunSkill:
    @pytest.mark.asyncio
    async def test_input_merging_with_defaults(self, tmp_path) -> None:
        skill = _make_loaded_skill(
            inputs={"name": InputSpec(type="str", default="world")},
            run_params=["name"],
            run_returns={"greeting": "hi"},
        )
        with patch("workflowskill.runner.runner.load_skill", return_value=skill):
            result = await run_skill(tmp_path / "test.md", {}, runtime=_mock_runtime())
        assert result == {"greeting": "hi"}

    @pytest.mark.asyncio
    async def test_user_input_overrides_default(self, tmp_path) -> None:
        skill = _make_loaded_skill(
            inputs={"name": InputSpec(type="str", default="world")},
            run_params=["name"],
            run_returns={"greeting": "hi"},
        )
        with patch("workflowskill.runner.runner.load_skill", return_value=skill):
            result = await run_skill(
                tmp_path / "test.md", {"name": "Alice"}, runtime=_mock_runtime()
            )
        assert result == {"greeting": "hi"}

    @pytest.mark.asyncio
    async def test_missing_required_input_raises(self, tmp_path) -> None:
        skill = _make_loaded_skill(
            inputs={"url": InputSpec(type="str")},
            run_params=["url"],
        )
        with patch("workflowskill.runner.runner.load_skill", return_value=skill):
            with pytest.raises(ValueError, match="Required workflow input 'url'"):
                await run_skill(tmp_path / "test.md", {}, runtime=_mock_runtime())

    @pytest.mark.asyncio
    async def test_non_dict_return_raises(self, tmp_path) -> None:
        skill = _make_loaded_skill(run_returns="not a dict")
        with patch("workflowskill.runner.runner.load_skill", return_value=skill):
            with pytest.raises(ValueError, match="instead of dict"):
                await run_skill(tmp_path / "test.md", {}, runtime=_mock_runtime())

    @pytest.mark.asyncio
    async def test_missing_output_keys_raises(self, tmp_path) -> None:
        skill = _make_loaded_skill(
            outputs={"message": OutputSpec(type="str"), "count": OutputSpec(type="int")},
            run_returns={"message": "hi"},
        )
        with patch("workflowskill.runner.runner.load_skill", return_value=skill):
            with pytest.raises(ValueError, match="missing declared output keys"):
                await run_skill(tmp_path / "test.md", {}, runtime=_mock_runtime())
