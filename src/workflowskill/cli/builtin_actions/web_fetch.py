"""web_fetch and web_fetch_raw built-in actions."""

from __future__ import annotations

import re
from typing import Any

import httpx
import markdownify

TIMEOUT_S = 30.0
VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


async def web_fetch(args: dict[str, Any]) -> dict[str, Any]:
    """Fetch a URL and return its content as markdown or plain text.

    Args:
        args: {
            "url": str (required),
            "extract": "markdown" | "text" (default: "markdown")
        }

    Returns:
        {"content": str, "url": str}
    """
    url = args.get("url")
    if not isinstance(url, str) or not url:
        raise ValueError('web_fetch: "url" is required and must be a string')

    extract = args.get("extract", "markdown")

    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        body = response.text

    if "text/html" not in content_type:
        return {"content": body, "url": url}

    # Convert HTML to markdown or plain text
    if extract == "text":
        # Strip tags via markdownify then strip markdown syntax
        md = markdownify.markdownify(body, heading_style="ATX")
        plain = re.sub(r"[#*_`\[\]()>~\-]", " ", md)
        plain = re.sub(r"\s+", " ", plain).strip()
        return {"content": plain, "url": url}
    else:
        md = markdownify.markdownify(body, heading_style="ATX", bullets="-")
        return {"content": md, "url": url}


async def web_fetch_raw(args: dict[str, Any]) -> dict[str, Any]:
    """Fetch a URL and return the raw response body without conversion.

    Args:
        args: {
            "url": str (required),
            "method": str (default: "GET"),
            "headers": dict[str, str] (optional),
            "body": str (optional, not allowed with GET)
        }

    Returns:
        {"content": str, "url": str, "content_type": str, "status": int}
    """
    url = args.get("url")
    if not isinstance(url, str) or not url:
        raise ValueError('web_fetch_raw: "url" is required and must be a string')

    method = str(args.get("method", "GET")).upper()
    if method not in VALID_METHODS:
        valid = ", ".join(sorted(VALID_METHODS))
        raise ValueError(f'web_fetch_raw: "method" must be one of {valid}')

    headers: dict[str, str] = {}
    raw_headers = args.get("headers")
    if isinstance(raw_headers, dict):
        headers = {str(k): str(v) for k, v in raw_headers.items()}

    body = args.get("body")
    if body is not None and method == "GET":
        raise ValueError('web_fetch_raw: "body" is not allowed with GET requests')
    if body is not None and not isinstance(body, str):
        raise ValueError('web_fetch_raw: "body" must be a string')

    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        request = client.build_request(
            method,
            url,
            headers=headers or None,
            content=body.encode() if isinstance(body, str) else None,
        )
        response = await client.send(request)
        content_type = response.headers.get("content-type", "")
        return {
            "content": response.text,
            "url": url,
            "content_type": content_type,
            "status": response.status_code,
        }
