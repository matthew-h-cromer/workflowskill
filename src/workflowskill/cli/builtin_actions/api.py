"""api built-in action — raw HTTP requests for JSON and other structured APIs."""

from __future__ import annotations

from typing import Any

import httpx

TIMEOUT_S = 30.0
VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


async def api(args: dict[str, Any]) -> dict[str, Any]:
    """Make an HTTP request and return the raw response body.

    Use for API endpoints returning JSON or other structured data.

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
        raise ValueError('api: "url" is required and must be a string')

    method = str(args.get("method", "GET")).upper()
    if method not in VALID_METHODS:
        valid = ", ".join(sorted(VALID_METHODS))
        raise ValueError(f'api: "method" must be one of {valid}')

    headers: dict[str, str] = {}
    raw_headers = args.get("headers")
    if isinstance(raw_headers, dict):
        headers = {str(k): str(v) for k, v in raw_headers.items()}

    body = args.get("body")
    if body is not None and method == "GET":
        raise ValueError('api: "body" is not allowed with GET requests')
    if body is not None and not isinstance(body, str):
        raise ValueError('api: "body" must be a string')

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
