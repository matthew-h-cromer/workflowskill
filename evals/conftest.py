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

# Stub weldable_act tool so the model can probe actions during authoring.
# The eval fixture handles tool calls by returning needs_args responses.
_WELDABLE_ACT_TOOL = {
    "name": "weldable_act",
    "description": "Probe or execute a Weldable action. Returns parameter schemas for action discovery.",
    "input_schema": {
        "type": "object",
        "properties": {
            "intent": {
                "type": "string",
                "description": "Natural language description of the action to perform.",
            },
            "args": {
                "type": "object",
                "description": "Arguments for the action.",
            },
        },
        "required": ["intent"],
    },
}


def _stub_weldable_response(intent: str) -> str:
    """Return a stub needs_args JSON string for a weldable_act probe.

    Maps common action intents to their slug and parameter schema so the
    model can proceed to generate the workflow without a live Weldable API.
    """
    import json

    intent_lower = intent.lower()

    # Common action mappings for eval tasks.
    _STUBS: dict[str, dict[str, Any]] = {
        "web.api": {
            "status": "needs_args",
            "action": "web.api",
            "missing": [
                {"name": "url", "type": "string", "required": True, "description": "URL to fetch"},
                {"name": "method", "type": "string", "required": False, "description": "HTTP method (GET, POST, etc.)"},
                {"name": "headers", "type": "object", "required": False, "description": "HTTP headers"},
                {"name": "body", "type": "object", "required": False, "description": "Request body"},
            ],
        },
        "web.scrape": {
            "status": "needs_args",
            "action": "web.scrape",
            "missing": [
                {"name": "url", "type": "string", "required": True, "description": "URL to scrape"},
                {"name": "selector", "type": "string", "required": False, "description": "CSS selector to extract"},
            ],
        },
        "anthropic.llm": {
            "status": "needs_args",
            "action": "anthropic.llm",
            "missing": [
                {"name": "prompt", "type": "string", "required": True, "description": "The prompt text"},
                {"name": "model", "type": "string", "required": False, "description": "Model name"},
                {"name": "max_tokens", "type": "integer", "required": False, "description": "Max tokens"},
                {"name": "schema", "type": "object", "required": False, "description": "JSON schema for structured output"},
            ],
        },
        "slack.post_message": {
            "status": "needs_args",
            "action": "slack.post_message",
            "missing": [
                {"name": "channel", "type": "string", "required": True, "description": "Channel name or ID"},
                {"name": "text", "type": "string", "required": True, "description": "Message text"},
            ],
        },
    }

    # Match intent to an action.
    for action, stub in _STUBS.items():
        if action.replace(".", " ") in intent_lower or action in intent_lower:
            return json.dumps(stub)

    # Fuzzy matching for natural language intents.
    if "scrape" in intent_lower or "extract" in intent_lower:
        return json.dumps(_STUBS["web.scrape"])
    if "fetch" in intent_lower or "api" in intent_lower or "http" in intent_lower:
        return json.dumps(_STUBS["web.api"])
    if "llm" in intent_lower or "summar" in intent_lower or "classify" in intent_lower or "generat" in intent_lower:
        return json.dumps(_STUBS["anthropic.llm"])
    if "slack" in intent_lower or "message" in intent_lower:
        return json.dumps(_STUBS["slack.post_message"])

    # Generic fallback.
    return json.dumps({
        "status": "needs_args",
        "action": intent.replace(" ", "_").lower(),
        "missing": [{"name": "input", "type": "string", "required": True, "description": "Primary input"}],
    })


@pytest.fixture(scope="session")
def generate_skill(tmp_path_factory: pytest.TempPathFactory) -> Any:
    """Return an async callable: generate(task, toolkit=None) -> raw SKILL.md string.

    If toolkit is given (e.g. "weldable"), its authoring context is appended to
    the system prompt so the model knows which actions are available.
    """
    skill_md = _get_skill_md()

    async def generate(task: str, toolkit: str | None = None) -> str:
        global _total_input_tokens, _total_output_tokens

        system = skill_md
        tools = [_SAVE_WORKFLOW_TOOL]
        if toolkit is not None:
            # Only need the authoring context (prompt.md), not a live API connection.
            # Instantiate with a dummy key to avoid requiring WELDABLE_API_KEY for evals.
            from workflowskill.toolkits.weldable import WeldableToolkit

            kit = WeldableToolkit(api_key="eval-dummy")
            system = skill_md + "\n\n" + kit.get_authoring_context()
            tools.append(_WELDABLE_ACT_TOOL)

        client = anthropic.AsyncAnthropic()
        messages: list[dict[str, Any]] = [{"role": "user", "content": task}]

        # Multi-turn loop: respond to weldable_act probes until save_workflow is called.
        max_turns = 6
        for _ in range(max_turns):
            message = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                temperature=0,
                system=system,
                tools=tools,
                messages=messages,
            )
            _total_input_tokens += message.usage.input_tokens
            _total_output_tokens += message.usage.output_tokens

            # Check for save_workflow call.
            tool_block = next(
                (b for b in message.content if b.type == "tool_use" and b.name == "save_workflow"),
                None,
            )
            if tool_block is not None:
                return tool_block.input["markdown"]

            # Handle weldable_act probe calls — return stub needs_args responses.
            probe_blocks = [b for b in message.content if b.type == "tool_use" and b.name == "weldable_act"]
            if not probe_blocks:
                # No tool calls at all — model responded with text only.
                text_blocks = [b.text for b in message.content if hasattr(b, "text")]
                detail = f" (text: {text_blocks[0][:200]}...)" if text_blocks else ""
                raise ValueError(f"Claude did not call save_workflow tool{detail}")

            # Append assistant message and tool results to continue the conversation.
            messages.append({"role": "assistant", "content": message.content})
            tool_results = []
            for probe in probe_blocks:
                intent = probe.input.get("intent", "")
                # Return a stub response that tells the model the action slug and
                # common parameters, so it can proceed to generate the workflow.
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": probe.id,
                    "content": _stub_weldable_response(intent),
                })
            messages.append({"role": "user", "content": tool_results})

        raise ValueError("Claude did not call save_workflow after max probe turns")

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
