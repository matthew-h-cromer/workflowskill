"""web_scrape built-in action — CSS selector extraction."""

from __future__ import annotations

from typing import Any

import httpx
from bs4 import BeautifulSoup

TIMEOUT_S = 30.0
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
USER_AGENT = "Mozilla/5.0 (compatible; WorkflowSkill/1.0)"


def _normalize_selector(key: str, val: object) -> tuple[str, str]:
    """Normalize a selector value to (css, extract) tuple.

    Accepts:
      - str: CSS selector, extract defaults to "text"
      - dict: {"css": str, "extract": str (optional, default "text")}
    """
    if isinstance(val, str):
        return (val, "text")
    if isinstance(val, dict):
        css = val.get("css")
        if not isinstance(css, str) or not css:
            raise ValueError(f'web_scrape: selector "{key}" dict must have a "css" string key')
        extract = val.get("extract", "text")
        if not isinstance(extract, str):
            raise ValueError(f'web_scrape: selector "{key}" "extract" must be a string')
        return (css, extract)
    raise ValueError(f'web_scrape: selector "{key}" must be a string or object')


async def web_scrape(args: dict[str, Any]) -> dict[str, Any]:
    """Fetch a URL and extract structured data via CSS selectors.

    Args:
        args: {
            "url": str (required),
            "selectors": dict[str, str | dict] (required) — name → CSS selector or object,
            "headers": dict[str, str] (optional)
        }

    Selector forms:
        "titles": "h3.title"                              # string = extract text (backward compat)
        "links": {"css": "a.card", "extract": "href"}    # object = extract attribute
        "body":  {"css": "div.content", "extract": "html"} # object = inner HTML

    Extract modes:
        "text" (default) — el.get_text(strip=True)
        "html"           — el.decode_contents() (inner HTML)
        anything else    — el.get(value) (attribute name, e.g. "href", "src")

    Returns:
        {"status": int, "results": dict[str, list[str]]}
    """
    url = args.get("url")
    if not isinstance(url, str) or not url:
        raise ValueError('web_scrape: "url" is required and must be a string')

    raw_selectors = args.get("selectors")
    if not isinstance(raw_selectors, dict):
        raise ValueError('web_scrape: "selectors" is required and must be an object')

    normalized: dict[str, tuple[str, str]] = {}
    for key, val in raw_selectors.items():
        normalized[key] = _normalize_selector(key, val)

    request_headers: dict[str, str] = {"User-Agent": USER_AGENT}
    raw_headers = args.get("headers")
    if isinstance(raw_headers, dict):
        for k, v in raw_headers.items():
            if isinstance(v, str):
                request_headers[str(k)] = v

    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url, headers=request_headers)
        content = response.content
        status_code = response.status_code
        encoding = response.encoding

    if len(content) > MAX_BYTES:
        raise ValueError(f"web_scrape: response too large for {url}")

    html = content.decode(encoding or "utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    results: dict[str, list[str]] = {}
    for name, (css, extract) in normalized.items():
        elements = soup.select(css)
        extracted: list[str] = []
        for el in elements:
            if extract == "text":
                value = el.get_text(strip=True)
            elif extract == "html":
                value = el.decode_contents()
            else:
                raw = el.get(extract)
                value = " ".join(raw) if isinstance(raw, list) else raw or ""
            if value:
                extracted.append(value)
        results[name] = extracted

    return {"status": status_code, "results": results}
