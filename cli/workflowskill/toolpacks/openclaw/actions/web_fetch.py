"""web_fetch action — fetch and extract readable content from a URL."""

from __future__ import annotations

from typing import Any

import httpx
import markdownify

TIMEOUT_S = 30.0
USER_AGENT = "Mozilla/5.0 (compatible; WorkflowSkill/1.0)"
DEFAULT_MAX_CHARS = 50_000


async def web_fetch(args: dict[str, Any]) -> dict[str, Any]:
    """Fetch a URL and return its content as readable text.

    Mirrors the OpenClaw web_fetch tool interface.

    Args:
        args: {
            "url": str (required) — http/https URL to fetch,
            "extractMode": str (optional, default: "markdown") — "markdown" or "text",
            "maxChars": int (optional, default: 50000) — truncate long pages,
        }

    Returns:
        {"content": str, "url": str, "status": int}
    """
    url = args.get("url")
    if not isinstance(url, str) or not url:
        raise ValueError('web_fetch: "url" is required and must be a string')

    extract_mode = args.get("extractMode", "markdown")
    if extract_mode not in ("markdown", "text"):
        extract_mode = "markdown"

    max_chars = args.get("maxChars", DEFAULT_MAX_CHARS)
    if not isinstance(max_chars, int) or max_chars <= 0:
        max_chars = DEFAULT_MAX_CHARS

    headers = {"User-Agent": USER_AGENT}

    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        raw_content = response.text
        status_code = response.status_code
        content_type = response.headers.get("content-type", "")

    # Convert HTML to readable format
    if "html" in content_type or raw_content.lstrip().startswith("<"):
        if extract_mode == "markdown":
            content = markdownify.markdownify(
                raw_content, heading_style="ATX", strip=["script", "style"]
            )
        else:
            # Plain text: strip tags via markdownify then remove markdown syntax
            md = markdownify.markdownify(raw_content, strip=["script", "style"])
            # Simple pass: remove markdown link syntax, keep text
            import re

            content = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md)
            content = re.sub(r"[#*`_~]", "", content)
    else:
        content = raw_content

    # Truncate if needed
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n\n[truncated at {max_chars} chars]"

    return {"content": content, "url": url, "status": status_code}
