"""WorkflowSkill CLI — run command."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

import click
from dotenv import load_dotenv

from workflowskill.display import (
    on_activity_complete,
    on_activity_start,
    print_error,
    print_result,
    print_running,
    print_toolkit,
    prompt_for_signal,
)
from workflowskill.loader.skill_loader import SkillLoadError
from workflowskill.runner.runner import run_skill
from workflowskill.runtimes import load_runtime
from workflowskill.toolkits import load_toolkit


@click.group()
def cli() -> None:
    """WorkflowSkill — workflow engine for agent automation."""
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
@click.option(
    "--toolkit",
    "toolkit_name",
    default="weldable",
    show_default=True,
    help="Toolkit to use for action execution.",
)
@click.option(
    "--runtime",
    "runtime_name",
    default="dbos",
    show_default=True,
    help="Runtime to use for workflow orchestration (e.g. dbos).",
)
def run(
    file: Path,
    raw_inputs: tuple[str, ...],
    json_input: str | None,
    toolkit_name: str,
    runtime_name: str,
) -> None:
    """Run a SKILL.md workflow file."""
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
        try:
            inputs[key] = json.loads(value)
        except json.JSONDecodeError:
            inputs[key] = value

    # Load toolkit.
    try:
        toolkit = load_toolkit(toolkit_name)
    except (ValueError, RuntimeError) as e:
        print_error(str(e))
        sys.exit(1)

    # Load runtime, wiring in the toolkit and display callbacks.
    try:
        runtime = load_runtime(
            runtime_name,
            toolkit=toolkit,
            on_activity_start=on_activity_start,
            on_activity_complete=on_activity_complete,
            on_signal_waiting=prompt_for_signal,
        )
    except ValueError as e:
        print_error(str(e))
        sys.exit(1)

    skill_name = file.stem
    print_running(skill_name, inputs)
    print_toolkit(toolkit.name, toolkit.homepage)

    try:
        result = asyncio.run(run_skill(file, inputs, runtime))
    except (SkillLoadError, ValueError, RuntimeError) as e:
        print_error(str(e))
        sys.exit(1)

    print_result(result, skill_name)


@cli.command()
@click.option(
    "--toolkit",
    required=True,
    type=click.Choice(["weldable"]),
    help="Toolkit provider to authenticate with.",
)
@click.option(
    "--url",
    "url_override",
    default=None,
    help="Override the API base URL (for dev/preview environments).",
)
def login(toolkit: str, url_override: str | None) -> None:
    """Authenticate with a toolkit provider via your browser."""
    from workflowskill.auth import login_weldable

    api_url = url_override or os.environ.get("WELDABLE_API_URL", "https://weldable.ai")
    env_path = Path.cwd() / ".env"
    login_weldable(api_url, env_path)


if __name__ == "__main__":
    cli()
