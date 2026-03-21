"""web_search action — search the web (mirrors OpenClaw's web_search tool).

Requires BRAVE_API_KEY environment variable.
Get a free key at https://brave.com/search/api/
"""

from __future__ import annotations

import os
from typing import Any

import httpx

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
TIMEOUT_S = 15.0


async def web_search(args: dict[str, Any]) -> dict[str, Any]:
    """Search the web and return results.

    Mirrors the OpenClaw web_search tool interface.
    Requires BRAVE_API_KEY environment variable.

    Args:
        args: {
            "query": str (required) — search query,
            "count": int (optional, default: 5, max: 10) — number of results,
            "country": str (optional) — 2-letter ISO country code,
            "language": str (optional) — ISO 639-1 language code,
            "freshness": str (optional) — "day", "week", "month", or "year",
        }

    Returns:
        {"results": list[{"title": str, "url": str, "description": str}], "query": str}
    """
    query = args.get("query")
    if not isinstance(query, str) or not query:
        raise ValueError('web_search: "query" is required and must be a string')

    api_key = os.environ.get("BRAVE_API_KEY")
    if not api_key:
        raise ValueError(
            "web_search: BRAVE_API_KEY environment variable is not set. "
            "Get a free key at https://brave.com/search/api/"
        )

    count = min(int(args.get("count", 5)), 10)
    params: dict[str, Any] = {"q": query, "count": count}

    if args.get("country"):
        params["country"] = args["country"]
    if args.get("language"):
        params["search_lang"] = args["language"]
    if args.get("freshness"):
        freshness_map = {"day": "pd", "week": "pw", "month": "pm", "year": "py"}
        mapped = freshness_map.get(str(args["freshness"]))
        if mapped:
            params["freshness"] = mapped

    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        response = await client.get(BRAVE_SEARCH_URL, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()

    web_results = data.get("web", {}).get("results", [])
    results = [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "description": r.get("description", ""),
        }
        for r in web_results
    ]

    return {"results": results, "query": query}
