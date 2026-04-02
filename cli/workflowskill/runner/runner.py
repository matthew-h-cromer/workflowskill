"""High-level runner: load SKILL.md → execute workflow via a Runtime → return result."""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any

from workflowskill.loader.skill_loader import load_skill
from workflowskill.runtimes._protocol import Runtime


async def run_skill(
    skill_path: str | Path,
    inputs: dict[str, Any] | None = None,
    runtime: Runtime | None = None,
) -> dict[str, Any]:
    """Load and execute a SKILL.md workflow end-to-end.

    Loads the workflow from *skill_path*, merges *inputs* with frontmatter
    defaults, and delegates execution to *runtime*.

    Args:
        skill_path: Path to the SKILL.md file.
        inputs:     Input values to pass to the workflow. Keys not provided
                    fall back to frontmatter defaults.
        runtime:    Runtime to use for execution. Defaults to DBOS
                    if not provided.

    Returns:
        The dict returned by the workflow's ``run`` method.

    Raises:
        SkillLoadError: If the SKILL.md cannot be parsed or is invalid.
        ValueError:     If the workflow returns a non-dict or is missing
                        declared output keys.
        RuntimeError:   If a required toolkit is not configured.
    """
    skill_path = Path(skill_path)

    if runtime is None:
        from workflowskill.runtimes import load_runtime

        runtime = load_runtime("dbos")

    loaded = load_skill(skill_path)

    # Merge provided inputs with frontmatter defaults.
    merged: dict[str, Any] = {}
    for input_name, spec in loaded.inputs.items():
        if spec.default is not None:
            merged[input_name] = spec.default
    merged.update(inputs or {})

    # Select the kwargs the workflow run method expects.
    kwargs = _build_kwargs(loaded.workflow_class, merged)

    # Note: loaded.workflow_class is passed here but DBOS does not use it
    # directly — it reloads the workflow from workflow_id (the file path) for
    # replay correctness. The load above is needed for input merging and
    # output validation only.
    result = await runtime.run_workflow(
        loaded.workflow_class().run,
        kwargs,
        workflow_id=str(skill_path),
    )

    if not isinstance(result, dict):
        raise ValueError(
            f"Workflow '{loaded.name}' returned {type(result).__name__!r} instead of dict."
        )

    if loaded.outputs:
        missing = [key for key in loaded.outputs if key not in result]
        if missing:
            raise ValueError(
                f"Workflow '{loaded.name}' result is missing declared output keys: {missing}"
            )

    return result


def _build_kwargs(workflow_class: type, merged: dict[str, Any]) -> dict[str, Any]:
    """Select the kwargs the workflow run method expects from the merged inputs."""
    try:
        run_method = getattr(workflow_class, "run", None)
        if run_method is None:
            return {}
        sig = inspect.signature(run_method)
        params = [(name, p) for name, p in sig.parameters.items() if name not in ("self", "cls")]
    except (ValueError, TypeError):
        return {}

    if not params:
        return {}

    kwargs: dict[str, Any] = {}
    for name, param in params:
        if name in merged:
            kwargs[name] = merged[name]
        elif param.default is not inspect.Parameter.empty:
            kwargs[name] = param.default
        else:
            raise ValueError(
                f"Required workflow input '{name}' was not provided and has no default."
            )

    return kwargs
