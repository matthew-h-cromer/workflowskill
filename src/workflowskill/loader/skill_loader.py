"""SKILL.md parser — extract workflow class and metadata from a SKILL.md file."""

from __future__ import annotations

import importlib.util
import re
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class SkillLoadError(Exception):
    """Raised when a SKILL.md file cannot be loaded or parsed."""


@dataclass
class InputSpec:
    """Specification for a single workflow input."""

    type: str
    default: Any = None


@dataclass
class OutputSpec:
    """Specification for a single workflow output."""

    type: str = "str"
    description: str = ""


@dataclass
class LoadedSkill:
    """A parsed and imported SKILL.md, ready for execution."""

    name: str
    description: str
    workflow_class: type
    inputs: dict[str, InputSpec] = field(default_factory=dict)
    outputs: dict[str, OutputSpec] = field(default_factory=dict)


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_CODE_BLOCK_RE = re.compile(r"```python\s*\n(.*?)```", re.DOTALL)

# Preamble injected into every generated workflow module.
# Provides all allowed imports and the _WorkflowProxy that defaults
# start_to_close_timeout=timedelta(seconds=30) on execute_activity calls.
_PREAMBLE = """\
from temporalio import workflow as _tw
from temporalio.common import RetryPolicy
from datetime import timedelta
import asyncio


class _WorkflowProxy:
    @staticmethod
    async def execute_activity(*args, start_to_close_timeout=None, **kwargs):
        if start_to_close_timeout is None:
            start_to_close_timeout = timedelta(seconds=30)
        return await _tw.execute_activity(
            *args, start_to_close_timeout=start_to_close_timeout, **kwargs
        )

    def __getattr__(self, name):
        return getattr(_tw, name)


workflow = _WorkflowProxy()


"""


def load_skill(path: str | Path) -> LoadedSkill:
    """Parse a SKILL.md file and return a LoadedSkill.

    Args:
        path: Path to the SKILL.md file.

    Returns:
        A LoadedSkill with the workflow class and metadata.

    Raises:
        SkillLoadError: If the file cannot be parsed or the workflow class is invalid.
    """
    skill_path = Path(path)
    if not skill_path.exists():
        raise SkillLoadError(f"File not found: {path}")

    content = skill_path.read_text(encoding="utf-8")

    # Extract frontmatter
    frontmatter: dict[str, Any] = {}
    fm_match = _FRONTMATTER_RE.match(content)
    if fm_match:
        try:
            frontmatter = yaml.safe_load(fm_match.group(1)) or {}
        except yaml.YAMLError as e:
            raise SkillLoadError(f"Invalid YAML frontmatter in {path}: {e}") from e

    name: str = frontmatter.get("name", skill_path.stem)
    description: str = frontmatter.get("description", "")

    # Parse input specs from frontmatter
    _ALLOWED_INPUT_TYPES = {"str", "int", "float", "bool", "list", "dict"}
    inputs: dict[str, InputSpec] = {}
    raw_inputs = frontmatter.get("inputs", {}) or {}
    for input_name, spec in raw_inputs.items():
        if not isinstance(spec, dict):
            raise SkillLoadError(
                f"Input '{input_name}' in {path} must be a mapping with"
                " 'type' and optional 'default'"
            )
        # Validate input name is a safe Python identifier
        import keyword
        if not str(input_name).isidentifier() or keyword.iskeyword(input_name):
            raise SkillLoadError(
                f"Input name '{input_name}' in {path} is not a valid Python identifier"
            )
        input_type = spec.get("type", "str")
        if input_type not in _ALLOWED_INPUT_TYPES:
            raise SkillLoadError(
                f"Input '{input_name}' in {path} has unsupported type '{input_type}'."
                f" Allowed types: {sorted(_ALLOWED_INPUT_TYPES)}"
            )
        default = spec.get("default")
        inputs[input_name] = InputSpec(type=input_type, default=default)

    # Parse output specs from frontmatter
    outputs: dict[str, OutputSpec] = {}
    raw_outputs = frontmatter.get("outputs", {}) or {}
    for output_name, spec in raw_outputs.items():
        if isinstance(spec, str):
            outputs[output_name] = OutputSpec(type=spec)
        elif isinstance(spec, dict):
            output_type = spec.get("type", "str")
            output_description = spec.get("description", "")
            outputs[output_name] = OutputSpec(type=output_type, description=output_description)
        else:
            raise SkillLoadError(
                f"Output '{output_name}' in {path} must be a string or mapping"
            )

    # Extract Python code block
    code_matches = _CODE_BLOCK_RE.findall(content)
    if not code_matches:
        raise SkillLoadError(f"No Python code block found in {path}")

    # Use the first python code block (method-body code only)
    user_code = code_matches[0]

    # AST validation: enforce restricted Python subset on method-body code
    from workflowskill.loader.validator import validate_workflow_code

    errors = validate_workflow_code(user_code, str(path))
    if errors:
        error_list = "\n".join(f"  - {e}" for e in errors)
        raise SkillLoadError(f"Workflow code in {path} failed validation:\n{error_list}")

    # Generate the full module: preamble + workflow class wrapping user code
    class_name = _name_to_class(name)
    method_sig = _build_method_signature(inputs)
    module_code = _generate_module_code(class_name, method_sig, user_code)

    workflow_class = _import_workflow_class(module_code, path)

    return LoadedSkill(
        name=name,
        description=description,
        workflow_class=workflow_class,
        inputs=inputs,
        outputs=outputs,
    )


def _name_to_class(name: str) -> str:
    """Convert a kebab-case or snake_case workflow name to a PascalCase class name.

    Examples:
        "hello-world"  -> "HelloWorldWorkflow"
        "fetch-page"   -> "FetchPageWorkflow"
        "my_workflow"  -> "MyWorkflowWorkflow"
    """
    parts = name.replace("_", "-").split("-")
    return "".join(p.capitalize() for p in parts) + "Workflow"


def _build_method_signature(inputs: dict[str, InputSpec]) -> str:
    """Build the run() method parameter list from frontmatter inputs.

    Returns a string like "self, url: str, count: int = 5" suitable for
    use in "async def run(<result>) -> dict:".
    """
    if not inputs:
        return "self"
    parts = ["self"]
    for param_name, spec in inputs.items():
        if spec.default is not None:
            parts.append(f"{param_name}: {spec.type} = {repr(spec.default)}")
        else:
            parts.append(f"{param_name}: {spec.type}")
    return ", ".join(parts)


def _generate_module_code(class_name: str, method_sig: str, user_code: str) -> str:
    """Generate a complete Python module from preamble + workflow class + user code."""
    body = user_code.strip()
    if not body:
        body = "pass"
    indented_body = textwrap.indent(body, "        ")
    return (
        _PREAMBLE
        + "@workflow.defn\n"
        + f"class {class_name}:\n"
        + "    @workflow.run\n"
        + f"    async def run({method_sig}) -> dict:\n"
        + indented_body
        + "\n"
    )


def _build_safe_builtins() -> dict[str, Any]:
    import builtins

    _SAFE_NAMES = [
        "dict",
        "list",
        "tuple",
        "set",
        "str",
        "int",
        "float",
        "bool",
        "len",
        "range",
        "enumerate",
        "zip",
        "map",
        "filter",
        "sorted",
        "reversed",
        "min",
        "max",
        "sum",
        "abs",
        "round",
        "isinstance",
        "any",
        "all",
        "print",
        "repr",
        "hash",
        "id",
        "type",
        "object",
        "super",
        "property",
        "staticmethod",
        "classmethod",
        "hasattr",
        "getattr",  # needed by _WorkflowProxy.__getattr__
        # Exceptions
        "Exception",
        "KeyError",
        "ValueError",
        "TypeError",
        "RuntimeError",
        "AttributeError",
        "IndexError",
        "StopIteration",
        "NotImplementedError",
        # Constants
        "True",
        "False",
        "None",
        # Import machinery needed by importlib/temporalio decorators
        "__build_class__",
        "__name__",
        "__import__",
    ]
    return {name: getattr(builtins, name) for name in _SAFE_NAMES if hasattr(builtins, name)}


_SAFE_BUILTINS: dict[str, Any] = _build_safe_builtins()


def _import_workflow_class(code: str, source_path: str | Path) -> type:
    """Write generated code to a temp file and import the @workflow.defn class."""
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        delete=False,
        encoding="utf-8",
    ) as f:
        f.write(code)
        tmp_path = f.name

    try:
        spec = importlib.util.spec_from_file_location("_workflowskill_workflow", tmp_path)
        if spec is None or spec.loader is None:
            raise SkillLoadError(f"Could not create module spec for {source_path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules["_workflowskill_workflow"] = module

        # Restrict builtins to a safe subset
        module.__builtins__ = _SAFE_BUILTINS  # type: ignore[attr-defined]

        try:
            loader = spec.loader
            assert loader is not None
            loader.exec_module(module)
        except SyntaxError as e:
            raise SkillLoadError(f"Syntax error in {source_path}: {e}") from e
        except Exception as e:
            raise SkillLoadError(f"Error loading {source_path}: {e}") from e

    finally:
        Path(tmp_path).unlink(missing_ok=True)
        sys.modules.pop("_workflowskill_workflow", None)

    # Find @workflow.defn classes
    defn_classes = []
    for attr_name in dir(module):
        obj = getattr(module, attr_name)
        if isinstance(obj, type) and _is_workflow_defn(obj):
            defn_classes.append(obj)

    if not defn_classes:
        raise SkillLoadError(
            f"No @workflow.defn class found after importing {source_path}. "
            "Ensure the class is decorated with @workflow.defn."
        )
    if len(defn_classes) > 1:
        names = [c.__name__ for c in defn_classes]
        raise SkillLoadError(
            f"Multiple @workflow.defn classes found in {source_path}: {names}. "
            "SKILL.md files must contain exactly one workflow class."
        )

    return defn_classes[0]


def _is_workflow_defn(cls: type) -> bool:
    """Return True if the class is decorated with @workflow.defn."""
    # temporalio sets _temporal_workflow_definition on the class
    return hasattr(cls, "__temporal_workflow_definition")
