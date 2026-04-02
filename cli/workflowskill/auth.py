"""Browser-based login flow for workflowskill toolkits."""

from __future__ import annotations

import os
import re
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import click
from rich.console import Console

console = Console()

_PROD_URL = "https://weldable.ai"

# Minimal HTML shown in the browser after the callback is received
_SUCCESS_HTML = b"""<!DOCTYPE html>
<html>
<head><title>Authorized</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafaf9}
.card{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #e5e7eb;background:#fff;max-width:360px}
h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#6b7280;margin:0;font-size:.9rem}</style></head>
<body><div class="card"><h1>&#x2713; Authorized</h1><p>You can close this tab and return to the terminal.</p></div></body>
</html>"""

_ERROR_HTML = b"""<!DOCTYPE html>
<html>
<head><title>Authorization denied</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafaf9}
.card{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #e5e7eb;background:#fff;max-width:360px}
h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#6b7280;margin:0;font-size:.9rem}</style></head>
<body><div class="card"><h1>Authorization denied</h1><p>You can close this tab and return to the terminal.</p></div></body>
</html>"""


class _CallbackResult:
    def __init__(self) -> None:
        self.key: str | None = None
        self.state: str | None = None
        self.error: str | None = None


def login_weldable(api_url: str, env_path: Path) -> None:
    """Run the browser-based login flow for the Weldable toolkit.

    Opens a browser to the Weldable authorization page, waits for the
    callback on a local HTTP server, and saves the API key to *.env*.

    Args:
        api_url: Base URL of the Weldable API (default: ``https://weldable.ai``).
        env_path: Path to the ``.env`` file to write the key into.
    """
    state = secrets.token_urlsafe(32)
    result = _CallbackResult()
    ready = threading.Event()

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return

            params = parse_qs(parsed.query)
            result.key = params.get("key", [None])[0]
            result.state = params.get("state", [None])[0]
            result.error = params.get("error", [None])[0]

            if result.error:
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(_ERROR_HTML)
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(_SUCCESS_HTML)

            ready.set()

        def log_message(self, *args: object) -> None:  # silence request logs
            pass

    server = HTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    auth_url = f"{api_url}/cli-auth?callback_port={port}&state={state}"
    console.print(f"\n[bold]Opening your browser to authorize Workflow Skill...[/bold]")
    console.print(f"[dim]If the browser doesn't open, visit:[/dim] {auth_url}\n")

    webbrowser.open(auth_url)

    timed_out = not ready.wait(timeout=120)
    server.shutdown()

    if timed_out:
        console.print("[red]Login timed out.[/red] Please try again.")
        raise SystemExit(1)

    if result.error:
        console.print("[red]Authorization denied.[/red]")
        raise SystemExit(1)

    if result.state != state:
        console.print("[red]Security validation failed.[/red] Please try again.")
        raise SystemExit(1)

    if not result.key:
        console.print("[red]No API key received.[/red] Please try again.")
        raise SystemExit(1)

    _save_to_env(env_path, result.key, api_url)
    console.print(f"[green]✓[/green] Logged in. API key saved to [bold]{env_path}[/bold]")


def _save_to_env(env_path: Path, api_key: str, api_url: str) -> None:
    """Write WELDABLE_API_KEY (and optionally WELDABLE_API_URL) to the .env file."""
    lines: list[str] = []
    if env_path.exists():
        existing = env_path.read_text()
        # Check for existing key and warn before overwriting
        if re.search(r"^WELDABLE_API_KEY=", existing, re.MULTILINE):
            if not click.confirm(
                f"WELDABLE_API_KEY already exists in {env_path}. Overwrite?",
                default=False,
            ):
                raise SystemExit(0)
        lines = existing.splitlines(keepends=True)

    lines = _upsert_env_var(lines, "WELDABLE_API_KEY", api_key)
    if api_url != _PROD_URL:
        lines = _upsert_env_var(lines, "WELDABLE_API_URL", api_url)

    env_path.write_text("".join(lines))


def _upsert_env_var(lines: list[str], key: str, value: str) -> list[str]:
    """Replace an existing KEY=value line or append a new one."""
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    new_line = f"{key}={value}\n"
    for i, line in enumerate(lines):
        if pattern.match(line.rstrip("\n")):
            lines[i] = new_line
            return lines
    # Not found — append
    if lines and not lines[-1].endswith("\n"):
        lines.append("\n")
    lines.append(new_line)
    return lines
