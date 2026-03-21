"""Fixtures for eval tests: LLM caller, skill parser, code extractor, score report."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import anthropic
import pytest

from workflowskill.loader.skill_loader import _CODE_BLOCK_RE, load_skill

# ---------------------------------------------------------------------------
# Auto-skip if no API key
# ---------------------------------------------------------------------------

_API_KEY = os.environ.get("ANTHROPIC_API_KEY")


def pytest_configure(config: Any) -> None:
    config.addinivalue_line("markers", "eval: LLM-based eval tests")


def pytest_collection_modifyitems(
    config: Any, items: list[Any]
) -> None:
    if not _API_KEY:
        skip = pytest.mark.skip(reason="ANTHROPIC_API_KEY not set")
        for item in items:
            if item.get_closest_marker("eval"):
                item.add_marker(skip)


# ---------------------------------------------------------------------------
# Score tracker
# ---------------------------------------------------------------------------

_scores: dict[str, bool] = {}
_total_input_tokens: int = 0
_total_output_tokens: int = 0


@pytest.fixture(autouse=True)
def _track_eval_score(request: pytest.FixtureRequest) -> Any:
    """Auto-fixture: record pass/fail for eval-marked tests."""
    yield
    if request.node.get_closest_marker("eval"):
        _scores[request.node.nodeid] = (
            request.node.rep_call.passed if hasattr(request.node, "rep_call") else True
        )


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item: Any, call: Any) -> Any:
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)


def pytest_sessionfinish(session: Any, exitstatus: Any) -> None:
    if not _scores:
        return
    print("\n\n" + "=" * 60)
    print("EVAL RESULTS")
    print("=" * 60)
    passed = sum(1 for v in _scores.values() if v)
    total = len(_scores)
    for nodeid, ok in _scores.items():
        status = "PASS" if ok else "FAIL"
        name = nodeid.split("::")[-1]
        print(f"  [{status}] {name}")
    print("-" * 60)
    print(f"  {passed}/{total} passed")
    if _total_input_tokens or _total_output_tokens:
        print(f"  Tokens used: {_total_input_tokens} in / {_total_output_tokens} out")
    print("=" * 60)


# ---------------------------------------------------------------------------
# SKILL.md system prompt (read once)
# ---------------------------------------------------------------------------

_SKILL_MD_PATH = Path(__file__).parents[1] / "skill" / "SKILL.md"
_SKILL_MD_CONTENT: str | None = None


def _get_skill_md() -> str:
    global _SKILL_MD_CONTENT
    if _SKILL_MD_CONTENT is None:
        _SKILL_MD_CONTENT = _SKILL_MD_PATH.read_text(encoding="utf-8")
    return _SKILL_MD_CONTENT


# ---------------------------------------------------------------------------
# generate_skill fixture
# ---------------------------------------------------------------------------

_SAVE_WORKFLOW_TOOL = {
    "name": "save_workflow",
    "description": "Save or update the workflow skill file.",
    "input_schema": {
        "type": "object",
        "properties": {
            "markdown": {
                "type": "string",
                "description": "The complete SKILL.md file content",
            },
        },
        "required": ["markdown"],
    },
}


@pytest.fixture(scope="session")
def generate_skill(tmp_path_factory: pytest.TempPathFactory) -> Any:
    """Return an async callable: generate(task) -> raw SKILL.md string."""
    skill_md = _get_skill_md()

    async def generate(task: str) -> str:
        global _total_input_tokens, _total_output_tokens
        client = anthropic.AsyncAnthropic()
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            temperature=0,
            system=skill_md,
            tools=[_SAVE_WORKFLOW_TOOL],
            messages=[{"role": "user", "content": task}],
        )
        _total_input_tokens += message.usage.input_tokens
        _total_output_tokens += message.usage.output_tokens

        tool_block = next(
            (b for b in message.content if b.type == "tool_use" and b.name == "save_workflow"),
            None,
        )
        if tool_block is None:
            raise ValueError("Claude did not call save_workflow tool")

        return tool_block.input["markdown"]

    return generate


# ---------------------------------------------------------------------------
# parse_skill fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def parse_skill(tmp_path_factory: pytest.TempPathFactory) -> Any:
    """Return a callable: parse(raw_content) -> LoadedSkill (or raises SkillLoadError)."""
    base = tmp_path_factory.mktemp("skills")
    counter = [0]

    def parse(raw: str) -> Any:
        counter[0] += 1
        p = base / f"skill_{counter[0]}.md"
        p.write_text(raw, encoding="utf-8")
        return load_skill(p)

    return parse


# ---------------------------------------------------------------------------
# extract_code fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def extract_code() -> Any:
    """Return a callable: extract(raw_content) -> first Python code block string."""

    def extract(raw: str) -> str:
        matches = _CODE_BLOCK_RE.findall(raw)
        if not matches:
            return ""
        return matches[0]

    return extract


# ---------------------------------------------------------------------------
# Snapshot support (--eval-snapshot flag)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def snapshot_dir(request: pytest.FixtureRequest) -> Path | None:
    if request.config.getoption("--eval-snapshot"):
        d = Path(__file__).parent / "snapshots"
        d.mkdir(exist_ok=True)
        return d
    return None


@pytest.fixture
def save_snapshot(snapshot_dir: Path | None, request: pytest.FixtureRequest) -> Any:
    """Return a callable: save(content) -> saves to snapshots/<test_name>.md."""

    def save(content: str) -> None:
        if snapshot_dir is None:
            return
        test_name = request.node.name
        path = snapshot_dir / f"{test_name}.md"
        path.write_text(content, encoding="utf-8")

    return save
