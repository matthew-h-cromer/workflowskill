"""llm built-in action — calls Claude via the Anthropic SDK."""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic
from temporalio.exceptions import ApplicationError

DEFAULT_MODEL = "claude-sonnet-4-6"
_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic()
    return _client


def set_client(client: anthropic.AsyncAnthropic) -> None:
    """Inject a mock client for testing."""
    global _client
    _client = client


async def llm(args: dict[str, Any]) -> dict[str, Any]:
    """Call Claude and return a parsed JSON object.

    Args:
        args: {
            "prompt": str (required),
            "system": str (optional),
            "schema": dict (optional) — JSON schema the response must match,
            "model": str (optional, default: claude-sonnet-4-6)
        }

    Returns:
        The parsed JSON object returned by the model, spread into a flat dict.
        If the model returns {"summary": "..."}, the result is {"summary": "..."}.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise ApplicationError(
            "ANTHROPIC_API_KEY environment variable is not set",
            non_retryable=True,
        )

    prompt = args.get("prompt")
    if not isinstance(prompt, str) or not prompt:
        raise ValueError('llm: "prompt" is required and must be a string')

    system_base = (args.get("system") or "")
    schema = args.get("schema")
    model = args.get("model") or DEFAULT_MODEL
    if not isinstance(model, str):
        model = DEFAULT_MODEL

    schema_constraint = ""
    if schema:
        schema_constraint = (
            f"Respond with a JSON object matching this schema:\n{json.dumps(schema, indent=2)}\n\n"
        )

    system = (
        (system_base + "\n\n" if system_base else "")
        + schema_constraint
        + "Always respond with valid JSON only. No markdown, no prose."
    )

    client = _get_client()
    message = await client.messages.create(
        model=str(model),
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    block = message.content[0] if message.content else None
    if block is None or block.type != "text":
        raise ValueError("llm: unexpected response format from Anthropic API")

    text = block.text

    # Strip markdown code fences if present
    stripped = (
        text.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )

    try:
        parsed: Any = json.loads(stripped)
    except json.JSONDecodeError as e:
        preview = stripped[:200]
        raise ValueError(f"llm: model returned invalid JSON: {e} — got: {preview!r}") from e
    if isinstance(parsed, dict):
        return parsed
    # If model returned a non-dict JSON value, wrap it
    return {"result": parsed}
