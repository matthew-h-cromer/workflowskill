"""browser action — headless browser (mirrors OpenClaw's browser tool).

Requires playwright: uv sync --extra openclaw
"""

from __future__ import annotations

import json
from typing import Any

_browser_context: Any = None  # playwright BrowserContext
_playwright_instance: Any = None
_browser_instance: Any = None


async def _get_context() -> Any:
    """Get or create the shared Playwright browser context."""
    global _playwright_instance, _browser_instance, _browser_context

    if _browser_context is not None:
        return _browser_context

    try:
        from playwright.async_api import async_playwright  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "Playwright is not installed. Run: uv sync --extra openclaw\n"
            "Then: uv run playwright install chromium"
        ) from e

    _playwright_instance = await async_playwright().start()
    _browser_instance = await _playwright_instance.chromium.launch(headless=True)
    _browser_context = await _browser_instance.new_context(
        viewport={"width": 1280, "height": 900},
        user_agent="Mozilla/5.0 (compatible; WorkflowSkill/1.0)",
    )
    return _browser_context


async def close_browser() -> None:
    """Close the shared browser context. Called at workflow teardown."""
    global _playwright_instance, _browser_instance, _browser_context
    if _browser_context is not None:
        await _browser_context.close()
        _browser_context = None
    if _browser_instance is not None:
        await _browser_instance.close()
        _browser_instance = None
    if _playwright_instance is not None:
        await _playwright_instance.stop()
        _playwright_instance = None


async def browser(args: dict[str, Any]) -> dict[str, Any]:
    """Control a headless Chromium browser.

    Mirrors the OpenClaw browser tool interface.

    Args:
        args: {
            "action": str (required) — one of:
                "navigate"   — go to a URL. Requires: url (str)
                "snapshot"   — get a text snapshot of the page. Returns: snapshot (str)
                "screenshot" — take a screenshot. Returns: path (str)
                "click"      — click an element. Requires: ref (str) or selector (str)
                "type"       — type text. Requires: ref or selector (str), text (str)
                "wait"       — wait for condition. Requires: text or url or timeout_ms (int)
                "tabs"       — list open tabs. Returns: tabs (list)
                "open"       — open a new tab with a URL. Requires: url (str)
                "close"      — close a tab. Requires: tab_id (int, default: current)
                "status"     — return browser status.
            ... action-specific parameters (see below)
        }

    Returns:
        Action-specific dict.
    """
    action = args.get("action")
    if not isinstance(action, str) or not action:
        raise ValueError('browser: "action" is required and must be a string')

    ctx = await _get_context()

    if action == "status":
        pages = ctx.pages
        return {"status": "running", "tabs": len(pages)}

    elif action == "tabs":
        pages = ctx.pages
        return {
            "tabs": [
                {"tab_id": i, "url": p.url, "title": await p.title()} for i, p in enumerate(pages)
            ]
        }

    elif action == "open":
        url = args.get("url")
        if not isinstance(url, str):
            raise ValueError('browser open: "url" is required')
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded")
        tab_id = ctx.pages.index(page)
        return {"tab_id": tab_id, "url": page.url}

    elif action == "close":
        pages = ctx.pages
        tab_id = args.get("tab_id", len(pages) - 1)
        if not isinstance(tab_id, int) or tab_id < 0 or tab_id >= len(pages):
            raise ValueError(f"browser close: invalid tab_id {tab_id}")
        await pages[tab_id].close()
        return {"closed": True, "tab_id": tab_id}

    # For remaining actions, use the current (last) page
    pages = ctx.pages
    if not pages:
        # Create a blank page if none exist
        page = await ctx.new_page()
    else:
        tab_id = args.get("tab_id", len(pages) - 1)
        page = pages[tab_id] if isinstance(tab_id, int) and 0 <= tab_id < len(pages) else pages[-1]

    if action == "navigate":
        url = args.get("url")
        if not isinstance(url, str):
            raise ValueError('browser navigate: "url" is required')
        response = await page.goto(url, wait_until="domcontentloaded")
        status = response.status if response else 0
        return {"url": page.url, "status": status}

    elif action == "snapshot":
        # Return a text representation of the page
        selector = args.get("selector")
        if selector:
            try:
                el = page.locator(selector).first
                text = await el.inner_text()
            except Exception:
                text = ""
        else:
            text = await page.inner_text("body")
        return {"snapshot": text, "url": page.url}

    elif action == "screenshot":
        import tempfile
        from pathlib import Path

        path = Path(tempfile.mktemp(suffix=".png"))
        full_page = bool(args.get("fullPage", False))
        await page.screenshot(path=str(path), full_page=full_page)
        return {"path": str(path), "url": page.url}

    elif action == "click":
        ref = args.get("ref") or args.get("selector")
        if not isinstance(ref, str):
            raise ValueError('browser click: "ref" or "selector" is required')
        double = bool(args.get("double", False))
        locator = page.locator(ref).first
        if double:
            await locator.dblclick()
        else:
            await locator.click()
        return {"clicked": True, "ref": ref}

    elif action == "type":
        ref = args.get("ref") or args.get("selector")
        if not isinstance(ref, str):
            raise ValueError('browser type: "ref" or "selector" is required')
        text = args.get("text", "")
        if not isinstance(text, str):
            raise ValueError('browser type: "text" must be a string')
        submit = bool(args.get("submit", False))
        locator = page.locator(ref).first
        await locator.fill(text)
        if submit:
            await locator.press("Enter")
        return {"typed": True, "ref": ref}

    elif action == "wait":
        timeout_ms = int(args.get("timeout_ms", 5000))
        wait_text = args.get("text")
        wait_url = args.get("url")
        if wait_text:
            await page.wait_for_selector(f"text={wait_text}", timeout=timeout_ms)
            return {"waited": True, "condition": "text", "value": wait_text}
        elif wait_url:
            await page.wait_for_url(wait_url, timeout=timeout_ms)
            return {"waited": True, "condition": "url", "value": wait_url}
        else:
            import asyncio

            await asyncio.sleep(timeout_ms / 1000)
            return {"waited": True, "condition": "timeout", "ms": timeout_ms}

    elif action == "evaluate":
        fn = args.get("fn")
        if not isinstance(fn, str):
            raise ValueError('browser evaluate: "fn" is required')
        result = await page.evaluate(fn)
        return {"result": json.dumps(result) if not isinstance(result, str) else result}

    else:
        raise ValueError(
            f"browser: unknown action {action!r}. "
            "Valid actions: navigate, snapshot, screenshot, click, type, wait, "
            "tabs, open, close, status, evaluate"
        )
