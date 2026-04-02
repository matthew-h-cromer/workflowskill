"""Rich console output for workflow execution."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

console = Console()


def print_result(result: dict[str, Any], skill_name: str) -> None:
    """Pretty-print a workflow result to the console."""
    json_str = json.dumps(result, indent=2, ensure_ascii=False)
    syntax = Syntax(json_str, "json", theme="monokai", word_wrap=True)
    console.print(Panel(syntax, title=f"[bold green]{skill_name}[/bold green]", expand=False))


def print_error(message: str) -> None:
    """Print an error message in red."""
    console.print(f"[bold red]Error:[/bold red] {message}")


def print_running(skill_name: str, inputs: dict[str, Any]) -> None:
    """Print a 'running' status line before execution."""
    if inputs:
        inputs_str = " ".join(f"{k}={v!r}" for k, v in inputs.items())
        console.print(f"[dim]Running[/dim] [bold]{skill_name}[/bold] [dim]{inputs_str}[/dim]")
    else:
        console.print(f"[dim]Running[/dim] [bold]{skill_name}[/bold]")


def print_toolkit(name: str, homepage: str) -> None:
    """Print which toolkit is active for this workflow run."""
    console.print(f"  [dim]toolkit:[/dim] [bold]{name}[/bold] [dim]({homepage})[/dim]")


_MAX_VALUE_LEN = 60


def _format_args(args: dict[str, Any]) -> str:
    """Format all args as key='value' pairs, truncating long values."""
    parts: list[str] = []
    for k, v in args.items():
        s = repr(v)
        if len(s) > _MAX_VALUE_LEN:
            s = s[: _MAX_VALUE_LEN - 4] + "...'"
        parts.append(f"{k}={s}")
    return " ".join(parts)


def on_activity_start(name: str, args: dict[str, Any]) -> None:
    """Print a status line when an activity begins executing."""
    formatted = _format_args(args)
    line = f"  [yellow]⟳[/yellow] {name} [dim]{formatted}[/dim]"
    # Truncate the plain-text content if too long (Rich markup doesn't count)
    console.print(line)


def on_activity_complete(name: str, elapsed_ms: int) -> None:
    """Print a status line when an activity finishes executing."""
    console.print(f"  [green]✓[/green] {name} [dim]({elapsed_ms}ms)[/dim]")


def on_activity_error(name: str, elapsed_ms: int, error: BaseException) -> None:
    """Print a failure line when an activity raises an error."""
    from workflowskill.errors import IntegrationNotConnectedError

    console.print(f"  [red]✗[/red] {name} [dim]({elapsed_ms}ms)[/dim]")
    if isinstance(error, IntegrationNotConnectedError) and error.connect_url:
        console.print(f"    [bold red]Integration not connected.[/bold red]")
        console.print(f"    Connect at: [bold cyan]{error.connect_url}[/bold cyan]")
    else:
        console.print(f"    [red]{error}[/red]")


async def prompt_for_signal(signal_name: str, prompt: str | None) -> Any:
    """Prompt the user for signal input and return the parsed data.

    If prompt is provided, displays it and reads a text response.
    If prompt is None, displays a generic 'press Enter to continue' message.
    Returns parsed JSON if the input is valid JSON, the raw string otherwise,
    or None for empty input.
    """
    if prompt:
        display_prompt = f"  [cyan]⏳[/cyan] {prompt} "
    else:
        display_prompt = (
            f"  [cyan]⏳[/cyan] Waiting for signal [bold]{signal_name!r}[/bold]"
            " — press Enter to continue: "
        )

    loop = asyncio.get_running_loop()
    raw = await loop.run_in_executor(None, lambda: console.input(display_prompt))

    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw
