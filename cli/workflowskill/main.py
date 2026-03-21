"""WorkflowSkill CLI — run and worker commands."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import click
from dotenv import load_dotenv

from workflowskill.actions.registry import ActionRegistry
from workflowskill.builtin_actions import register_builtin_actions
from workflowskill.display import (
    on_activity_complete,
    on_activity_start,
    print_error,
    print_result,
    print_running,
    print_server_info,
)
from workflowskill.loader.skill_loader import SkillLoadError
from workflowskill.runner.runner import run_skill


@click.group()
def cli() -> None:
    """WorkflowSkill — Temporal-based workflow engine for agent automation."""
    load_dotenv(Path.cwd() / ".env", override=True)


@cli.command()
@click.argument("file", type=click.Path(exists=True, path_type=Path))
@click.option(
    "-i",
    "--input",
    "raw_inputs",
    multiple=True,
    metavar="KEY=VALUE",
    help="Pass a workflow input as key=value. Repeatable.",
)
@click.option(
    "--json-input",
    "json_input",
    default=None,
    help="Pass all workflow inputs as a JSON object string.",
)
def run(file: Path, raw_inputs: tuple[str, ...], json_input: str | None) -> None:
    """Run a SKILL.md workflow file."""
    # Parse inputs
    inputs: dict[str, Any] = {}

    if json_input:
        try:
            parsed = json.loads(json_input)
            if not isinstance(parsed, dict):
                print_error("--json-input must be a JSON object")
                sys.exit(1)
            inputs.update(parsed)
        except json.JSONDecodeError as e:
            print_error(f"Invalid JSON in --json-input: {e}")
            sys.exit(1)

    for raw in raw_inputs:
        if "=" not in raw:
            print_error(f'Invalid input "{raw}": expected KEY=VALUE format')
            sys.exit(1)
        key, _, value = raw.partition("=")
        # Attempt to parse as JSON (handles numbers, booleans, null)
        try:
            inputs[key] = json.loads(value)
        except json.JSONDecodeError:
            inputs[key] = value  # treat as plain string

    # Build registry with built-in actions
    registry = ActionRegistry(
        on_activity_start=on_activity_start,
        on_activity_complete=on_activity_complete,
    )
    register_builtin_actions(registry)

    # Determine skill name for display
    skill_name = file.stem

    print_running(skill_name, inputs)

    try:
        result = asyncio.run(run_skill(file, inputs, registry, on_server_started=print_server_info))
    except SkillLoadError as e:
        print_error(str(e))
        sys.exit(1)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)

    print_result(result, skill_name)


@cli.command()
def worker() -> None:
    """Start a long-running worker connected to an external Temporal server.

    Requires TEMPORAL_HOST, TEMPORAL_NAMESPACE, and TEMPORAL_TASK_QUEUE
    environment variables (or their defaults).
    """
    from workflowskill.config import TemporalConfig

    config = TemporalConfig()
    click.echo("Worker mode not yet implemented.")
    click.echo(f"Would connect to: {config.host} / {config.namespace} / {config.task_queue}")


if __name__ == "__main__":
    cli()
