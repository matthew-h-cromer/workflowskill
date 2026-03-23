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
from workflowskill.display import (
    on_activity_complete,
    on_activity_start,
    print_error,
    print_result,
    print_running,
    print_server_info,
    print_workflow_id,
    prompt_for_signal,
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
@click.option(
    "--toolpack",
    "toolpacks",
    multiple=True,
    default=("builtin",),
    show_default=True,
    help="Tool pack to load (repeatable). Available: builtin, openclaw.",
)
def run(
    file: Path,
    raw_inputs: tuple[str, ...],
    json_input: str | None,
    toolpacks: tuple[str, ...],
) -> None:
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

    # Build registry and load requested tool packs
    from workflowskill.toolpacks import load_toolpack

    registry = ActionRegistry(
        on_activity_start=on_activity_start,
        on_activity_complete=on_activity_complete,
    )
    for pack_name in toolpacks:
        try:
            pack = load_toolpack(pack_name)
        except ValueError as e:
            print_error(str(e))
            sys.exit(1)
        pack.register(registry)

    # Determine skill name for display
    skill_name = file.stem

    print_running(skill_name, inputs)

    try:
        result = asyncio.run(
            run_skill(
                file,
                inputs,
                registry,
                on_server_started=print_server_info,
                on_workflow_started=print_workflow_id,
                on_signal_waiting=prompt_for_signal,
            )
        )
    except SkillLoadError as e:
        print_error(str(e))
        sys.exit(1)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)

    print_result(result, skill_name)


def _invoke_action(pack_name: str, action_name: str, json_args: str) -> None:
    """Shared implementation for builtin_action and openclaw_action."""
    from workflowskill.toolpacks import load_toolpack

    try:
        args = json.loads(json_args)
    except json.JSONDecodeError as e:
        print_error(f"Invalid JSON args: {e}")
        sys.exit(1)
    if not isinstance(args, dict):
        print_error("Args must be a JSON object")
        sys.exit(1)

    registry = ActionRegistry()
    try:
        pack = load_toolpack(pack_name)
    except ValueError as e:
        print_error(str(e))
        sys.exit(1)
    pack.register(registry)

    if not registry.has(action_name):
        available = ", ".join(registry.names())
        print_error(f"Unknown action '{action_name}'. Available: {available}")
        sys.exit(1)

    handler = registry.get_handler(action_name)

    try:
        import inspect

        if inspect.iscoroutinefunction(handler):
            result = asyncio.run(handler(args))
        else:
            result = handler(args)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)

    click.echo(json.dumps(result, indent=2))


@cli.command(name="builtin_action")
@click.argument("action_name")
@click.argument("json_args")
def builtin_action(action_name: str, json_args: str) -> None:
    """Invoke a single builtin action (api, scrape, llm) directly."""
    _invoke_action("builtin", action_name, json_args)


@cli.command(name="openclaw_action")
@click.argument("action_name")
@click.argument("json_args")
def openclaw_action(action_name: str, json_args: str) -> None:
    """Invoke a single OpenClaw action (browser, web_search, etc.) directly."""
    _invoke_action("openclaw", action_name, json_args)


@cli.command(name="mcp_action")
@click.argument("action_name")
@click.argument("json_args")
def mcp_action(action_name: str, json_args: str) -> None:
    """Invoke a single MCP tool directly for testing."""
    _invoke_action("mcp", action_name, json_args)


@cli.command(name="mcp_list")
def mcp_list() -> None:
    """List all tools from configured MCP servers."""
    from workflowskill.toolpacks import load_toolpack

    try:
        pack = load_toolpack("mcp")
    except ValueError as e:
        print_error(str(e))
        sys.exit(1)

    registry = ActionRegistry()
    pack.register(registry)

    if not registry.names():
        click.echo("No MCP tools found. Check mcp.json configuration.")
        return

    click.echo("Available MCP tools:")
    for name in sorted(registry.names()):
        click.echo(f"  {name}")


@cli.command()
@click.argument("workflow_id")
@click.argument("signal_name")
@click.option(
    "--data",
    "data",
    default=None,
    help="JSON data to send with the signal.",
)
@click.option(
    "--server",
    "server",
    default="localhost:7233",
    show_default=True,
    help="Temporal server address (host:port).",
)
def signal(workflow_id: str, signal_name: str, data: str | None, server: str) -> None:
    """Send a signal to a running workflow.

    WORKFLOW_ID is the ID printed when the workflow starts.
    SIGNAL_NAME is the name passed to wait_for_signal() in the workflow.

    Example (send approval with data):

        workflowskill signal approval-gate-abc123 approval --data '{"approved": true}'

    Example (send without data, e.g. to resume after login):

        workflowskill signal apply-to-job-abc123 logged_in
    """
    from temporalio.client import Client

    signal_data: Any = None
    if data is not None:
        try:
            signal_data = json.loads(data)
        except json.JSONDecodeError as e:
            print_error(f"Invalid JSON in --data: {e}")
            sys.exit(1)

    async def _send() -> None:
        client = await Client.connect(server)
        handle = client.get_workflow_handle(workflow_id)
        await handle.signal(signal_name, signal_data)

    try:
        asyncio.run(_send())
    except Exception as e:
        print_error(str(e))
        sys.exit(1)

    click.echo(f"Signal '{signal_name}' sent to {workflow_id}.")


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
