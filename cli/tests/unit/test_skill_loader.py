"""Unit tests for the SKILL.md loader."""

import textwrap
from pathlib import Path

import pytest

from workflowskill.loader.skill_loader import InputSpec, OutputSpec, SkillLoadError, load_skill


def write_skill(tmp_path: Path, content: str) -> Path:
    p = tmp_path / "test-skill.md"
    p.write_text(textwrap.dedent(content), encoding="utf-8")
    return p


class TestLoadSkill:
    def test_minimal_hello_world(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: hello
            description: A hello workflow
            ---

            ```python
            return {"message": "hello"}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.name == "hello"
        assert skill.description == "A hello workflow"
        assert skill.workflow_class.__name__ == "HelloWorkflow"
        assert skill.inputs == {}

    def test_inputs_parsed(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: with-inputs
            description: Has inputs
            inputs:
              subject:
                type: str
                default: "ocean"
              count:
                type: int
                default: 5
            ---

            ```python
            return {"subject": subject, "count": count}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.inputs["subject"] == InputSpec(type="str", default="ocean")
        assert skill.inputs["count"] == InputSpec(type="int", default=5)

    def test_input_description_parsed(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: with-described-input
            description: Has described input
            inputs:
              job_url:
                type: str
                description: "LinkedIn job posting URL to apply from"
              config_path:
                type: str
                default: "config.json"
            ---

            ```python
            return {"url": job_url, "config": config_path}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.inputs["job_url"].description == "LinkedIn job posting URL to apply from"
        assert skill.inputs["config_path"].description == ""

    def test_actions_parsed(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: with-actions
            description: Uses actions
            actions: [browser, llm_task]
            ---

            ```python
            return {"done": True}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.actions == ["browser", "llm_task"]

    def test_actions_defaults_to_empty(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: no-actions
            description: Pure logic
            ---

            ```python
            return {"message": "hello"}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.actions == []

    def test_no_code_block_raises(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: no-code
            description: Missing code block
            ---

            No Python code here.
            """,
        )
        with pytest.raises(SkillLoadError, match="No Python code block"):
            load_skill(p)

    def test_import_in_code_raises(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: bad
            description: Has an import in method body
            ---

            ```python
            import os
            return {}
            ```
            """,
        )
        with pytest.raises(SkillLoadError, match="auto-injected"):
            load_skill(p)

    def test_file_not_found_raises(self, tmp_path: Path) -> None:
        with pytest.raises(SkillLoadError, match="not found"):
            load_skill(tmp_path / "nonexistent.md")

    def test_name_defaults_to_stem(self, tmp_path: Path) -> None:
        p = tmp_path / "my-workflow.md"
        p.write_text(
            textwrap.dedent("""\
            ```python
            return {}
            ```
            """),
            encoding="utf-8",
        )
        skill = load_skill(p)
        assert skill.name == "my-workflow"

    def test_syntax_error_raises(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: bad-syntax
            description: Has a syntax error
            ---

            ```python
            return {
            ```
            """,
        )
        with pytest.raises(SkillLoadError):
            load_skill(p)

    def test_class_name_derived_from_name(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: fetch-page
            description: Fetches a page
            inputs:
              url:
                type: str
                default: "https://example.com"
            ---

            ```python
            result = await workflow.execute_activity(
                "api",
                {"url": url},
            )
            return {"content": result["content"]}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.workflow_class.__name__ == "FetchPageWorkflow"

    def test_empty_code_block_is_valid(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: empty
            description: Empty workflow
            ---

            ```python
            ```
            """,
        )
        # Empty code body is valid (generates pass)
        skill = load_skill(p)
        assert skill.name == "empty"

    def test_outputs_parsed(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: with-outputs
            description: Has outputs
            outputs:
              message:
                type: str
                description: The greeting message
              count:
                type: int
            ---

            ```python
            return {"message": "hello", "count": 1}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.outputs["message"] == OutputSpec(type="str", description="The greeting message")
        assert skill.outputs["count"] == OutputSpec(type="int", description="")

    def test_outputs_shorthand_string(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: shorthand
            description: Uses string shorthand for output type
            outputs:
              result: str
            ---

            ```python
            return {"result": "ok"}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.outputs["result"] == OutputSpec(type="str", description="")

    def test_outputs_empty_by_default(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: no-outputs
            description: No outputs declared
            ---

            ```python
            return {"value": 42}
            ```
            """,
        )
        skill = load_skill(p)
        assert skill.outputs == {}

    def test_outputs_invalid_type_raises(self, tmp_path: Path) -> None:
        p = write_skill(
            tmp_path,
            """\
            ---
            name: bad-output
            description: Bad output spec
            outputs:
              result: 123
            ---

            ```python
            return {"result": "ok"}
            ```
            """,
        )
        with pytest.raises(SkillLoadError, match="Output 'result'"):
            load_skill(p)
