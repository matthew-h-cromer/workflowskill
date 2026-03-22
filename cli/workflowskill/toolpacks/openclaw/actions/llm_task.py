"""llm_task action — structured LLM call (mirrors OpenClaw's llm-task tool)."""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic
from temporalio.exceptions import ApplicationError

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_MAX_TOKENS = 4096
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


async def llm_task(args: dict[str, Any]) -> dict[str, Any]:
    """Call an LLM and return a structured JSON response.

    Mirrors the OpenClaw llm-task tool interface (JSON-only output, no tools).

    Args:
        args: {
            "prompt": str (required) — task instruction,
            "input": any (optional) — data for the LLM to process (JSON-serialized into prompt),
            "schema": dict (optional) — JSON schema the output must match,
            "model": str (optional, default: claude-sonnet-4-6),
            "temperature": float (optional),
            "maxTokens": int (optional, default: 4096),
        }

    Returns:
        The parsed JSON object returned by the model.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise ApplicationError(
            "ANTHROPIC_API_KEY environment variable is not set",
            non_retryable=True,
        )

    prompt = args.get("prompt")
    if not isinstance(prompt, str) or not prompt:
        raise ValueError('llm_task: "prompt" is required and must be a string')

    model = str(args.get("model") or DEFAULT_MODEL)
    max_tokens = int(args.get("maxTokens") or DEFAULT_MAX_TOKENS)
    temperature = args.get("temperature")

    # Build system prompt
    schema = args.get("schema")
    schema_constraint = ""
    if schema:
        schema_constraint = (
            f"Respond with a JSON object matching this schema:\n{json.dumps(schema, indent=2)}\n\n"
        )
    system = schema_constraint + "Always respond with valid JSON only. No markdown, no prose."

    # Append input data to prompt if provided
    input_data = args.get("input")
    full_prompt = prompt
    if input_data is not None:
        serialized = input_data if isinstance(input_data, str) else json.dumps(input_data, indent=2)
        full_prompt = f"{prompt}\n\nInput data:\n{serialized}"

    create_kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": full_prompt}],
    }
    if temperature is not None:
        create_kwargs["temperature"] = float(temperature)

    client = _get_client()
    message = await client.messages.create(**create_kwargs)

    block = message.content[0] if message.content else None
    if block is None or block.type != "text":
        raise ValueError("llm_task: unexpected response format from Anthropic API")

    text = block.text
    stripped = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed: Any = json.loads(stripped)
    except json.JSONDecodeError as e:
        preview = stripped[:200]
        raise ValueError(f"llm_task: model returned invalid JSON: {e} — got: {preview!r}") from e

    result = parsed if isinstance(parsed, dict) else {"result": parsed}

    # Attach usage metadata (prefixed to avoid collisions with schema output)
    if hasattr(message, "usage") and message.usage:
        result["__usage"] = {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
            "model": model,
        }

    return result
