"""Rich console output for workflow execution."""

from __future__ import annotations

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


def print_server_info(address: str) -> None:
    """Print the embedded Temporal server address."""
    console.print(f"[dim]Temporal server:[/dim] [dim cyan]{address}[/dim cyan]")


def print_running(skill_name: str, inputs: dict[str, Any]) -> None:
    """Print a 'running' status line before execution."""
    if inputs:
        inputs_str = " ".join(f"{k}={v!r}" for k, v in inputs.items())
        console.print(f"[dim]Running[/dim] [bold]{skill_name}[/bold] [dim]{inputs_str}[/dim]")
    else:
        console.print(f"[dim]Running[/dim] [bold]{skill_name}[/bold]")


def on_activity_start(name: str) -> None:
    """Print a status line when an activity begins executing."""
    console.print(f"  [yellow]⟳[/yellow] Executing {name}...")


def on_activity_complete(name: str, elapsed_ms: int) -> None:
    """Print a status line when an activity finishes executing."""
    console.print(f"  [green]✓[/green] {name} [dim]({elapsed_ms}ms)[/dim]")
