"""File operation actions — read, write, edit (mirrors OpenClaw's read/write/edit tools)."""

from __future__ import annotations

from pathlib import Path
from typing import Any


async def read(args: dict[str, Any]) -> dict[str, Any]:
    """Read a file and return its contents.

    Mirrors the OpenClaw read tool interface.

    Args:
        args: {
            "path": str (required) — file path to read,
            "encoding": str (optional, default: "utf-8"),
        }

    Returns:
        {"content": str, "path": str, "size": int}
    """
    path_str = args.get("path")
    if not isinstance(path_str, str) or not path_str:
        raise ValueError('read: "path" is required and must be a string')

    encoding = str(args.get("encoding", "utf-8"))
    path = Path(path_str)

    try:
        content = path.read_text(encoding=encoding)
    except FileNotFoundError as e:
        raise ValueError(f"read: file not found: {path_str}") from e
    except PermissionError as e:
        raise ValueError(f"read: permission denied: {path_str}") from e
    except UnicodeDecodeError as e:
        raise ValueError(f"read: encoding error ({encoding}): {e}") from e

    return {"content": content, "path": str(path.resolve()), "size": len(content)}


async def write(args: dict[str, Any]) -> dict[str, Any]:
    """Write content to a file, creating it and any parent directories as needed.

    Mirrors the OpenClaw write tool interface.

    Args:
        args: {
            "path": str (required) — file path to write,
            "content": str (required) — content to write,
            "encoding": str (optional, default: "utf-8"),
        }

    Returns:
        {"path": str, "size": int, "created": bool}
    """
    path_str = args.get("path")
    if not isinstance(path_str, str) or not path_str:
        raise ValueError('write: "path" is required and must be a string')

    content = args.get("content")
    if not isinstance(content, str):
        raise ValueError('write: "content" is required and must be a string')

    encoding = str(args.get("encoding", "utf-8"))
    path = Path(path_str)
    existed = path.exists()

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding=encoding)
    except PermissionError as e:
        raise ValueError(f"write: permission denied: {path_str}") from e

    return {"path": str(path.resolve()), "size": len(content), "created": not existed}


async def edit(args: dict[str, Any]) -> dict[str, Any]:
    """Replace occurrences of old_string with new_string in a file.

    Mirrors the OpenClaw edit tool interface.

    Args:
        args: {
            "path": str (required) — file path to edit,
            "old_string": str (required) — text to find,
            "new_string": str (required) — replacement text,
            "replace_all": bool (optional, default: False) — replace all occurrences,
        }

    Returns:
        {"path": str, "replacements": int}
    """
    path_str = args.get("path")
    if not isinstance(path_str, str) or not path_str:
        raise ValueError('edit: "path" is required and must be a string')

    old_string = args.get("old_string")
    if not isinstance(old_string, str):
        raise ValueError('edit: "old_string" is required and must be a string')

    new_string = args.get("new_string")
    if not isinstance(new_string, str):
        raise ValueError('edit: "new_string" is required and must be a string')

    replace_all = bool(args.get("replace_all", False))
    path = Path(path_str)

    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError as e:
        raise ValueError(f"edit: file not found: {path_str}") from e

    count = content.count(old_string)
    if count == 0:
        raise ValueError(f"edit: old_string not found in {path_str}")

    if replace_all:
        new_content = content.replace(old_string, new_string)
        replacements = count
    else:
        new_content = content.replace(old_string, new_string, 1)
        replacements = 1

    path.write_text(new_content, encoding="utf-8")
    return {"path": str(path.resolve()), "replacements": replacements}
