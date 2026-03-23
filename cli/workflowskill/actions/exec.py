"""exec action — run shell commands."""

from __future__ import annotations

import asyncio
import os
from typing import Any


async def exec_action(args: dict[str, Any]) -> dict[str, Any]:
    """Run a shell command and return its output.

    Args:
        args: {
            "command": str (required) — shell command to execute,
            "workdir": str (optional) — working directory,
            "env": dict[str, str] (optional) — additional environment variables,
            "timeout": int (optional, default: 60) — kill timeout in seconds,
        }

    Returns:
        {"output": str, "exit_code": int, "status": "done" | "error"}
    """
    command = args.get("command")
    if not isinstance(command, str) or not command:
        raise ValueError('exec: "command" is required and must be a string')

    workdir = args.get("workdir")
    if workdir is not None and not isinstance(workdir, str):
        raise ValueError('exec: "workdir" must be a string')

    extra_env: dict[str, str] | None = None
    raw_env = args.get("env")
    if isinstance(raw_env, dict):
        extra_env = {str(k): str(v) for k, v in raw_env.items()}

    timeout: float = 60.0
    raw_timeout = args.get("timeout")
    if raw_timeout is not None:
        try:
            timeout = float(raw_timeout)
        except (TypeError, ValueError) as e:
            raise ValueError('exec: "timeout" must be a number') from e

    merged_env = {**os.environ}
    if extra_env:
        merged_env.update(extra_env)

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=workdir,
            env=merged_env,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except TimeoutError:
            proc.kill()
            await proc.communicate()
            return {
                "output": f"exec: command timed out after {timeout}s",
                "exit_code": -1,
                "status": "error",
            }

        output = stdout.decode("utf-8", errors="replace") if stdout else ""
        exit_code = proc.returncode if proc.returncode is not None else 0
        return {
            "output": output,
            "exit_code": exit_code,
            "status": "done" if exit_code == 0 else "error",
        }
    except FileNotFoundError as e:
        raise ValueError(f"exec: {e}") from e
