"""browser action — headless browser (mirrors OpenClaw's browser tool).

Requires playwright: uv sync --extra openclaw

Environment variables:
  BROWSER_USER_DATA_DIR  Path to Chrome profile directory to load existing session
                         (e.g., ~/Library/Application Support/Google/Chrome)
  BROWSER_HEADLESS       "true" (default) or "false" to show browser window
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

_browser_context: Any = None  # playwright BrowserContext
_playwright_instance: Any = None
_browser_instance: Any = None  # None when using launch_persistent_context
_ref_map: dict[str, str] = {}  # ref (e.g., "e1") -> CSS selector


def _is_ref(s: str) -> bool:
    """Return True if s looks like an element ref (e1, e12, etc.)"""
    return bool(re.match(r"^e\d+$", s))


def _ref_selector(ref: str) -> str:
    """Return the CSS selector for a ref."""
    return f'[data-wf-ref="{ref}"]'


def _make_profile_copy(src_dir: str) -> str:
    """Copy key Chrome profile files to a temp dir so we can use it while Chrome is running.

    Only copies the files needed for session auth (cookies, preferences, local state).
    Returns the path to the new temp profile root directory.
    """
    import shutil
    import tempfile

    src = os.path.expanduser(src_dir)
    # Chrome uses a nested structure: user_data_dir/Default/Cookies
    # Playwright's user_data_dir is the root (containing the "Default" folder)
    tmp_root = tempfile.mkdtemp(prefix="workflowskill_chrome_")
    default_src = os.path.join(src, "Default")
    default_dst = os.path.join(tmp_root, "Default")
    os.makedirs(default_dst, exist_ok=True)

    # Copy only the files we need for session auth
    _SESSION_FILES = [
        "Cookies",
        "Preferences",
        "Secure Preferences",
        "Local State",
    ]
    # Copy Local State to root (Chrome stores it at user_data_dir/Local State)
    local_state_src = os.path.join(src, "Local State")
    if os.path.exists(local_state_src):
        shutil.copy2(local_state_src, os.path.join(tmp_root, "Local State"))

    for fname in _SESSION_FILES:
        fsrc = os.path.join(default_src, fname)
        if os.path.exists(fsrc):
            try:
                shutil.copy2(fsrc, os.path.join(default_dst, fname))
            except OSError:
                pass  # File may be locked; skip it

    return tmp_root


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

    headless_env = os.environ.get("BROWSER_HEADLESS", "true").lower()
    headless = headless_env not in ("false", "0", "no")
    user_data_dir = os.environ.get("BROWSER_USER_DATA_DIR", "").strip()

    _playwright_instance = await async_playwright().start()

    storage_state_path = os.environ.get("BROWSER_STORAGE_STATE", "").strip()
    storage_state_path = os.path.expanduser(storage_state_path) if storage_state_path else ""

    if user_data_dir:
        user_data_dir = os.path.expanduser(user_data_dir)
        # Copy profile to a temp dir so we can use it while Chrome is already running
        profile_dir = _make_profile_copy(user_data_dir)
        # Use persistent context to load existing Chrome profile (e.g., LinkedIn session)
        _browser_context = await _playwright_instance.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            headless=headless,
            channel="chrome",
            viewport={"width": 1280, "height": 900},
            # Mimic real Chrome user agent to avoid bot detection
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            args=["--disable-blink-features=AutomationControlled"],
        )
        # launch_persistent_context returns a BrowserContext directly — no separate Browser
    else:
        _browser_instance = await _playwright_instance.chromium.launch(headless=headless)
        _browser_context = await _browser_instance.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )

    # Load saved session state if provided (cookies + localStorage)
    if storage_state_path and os.path.exists(storage_state_path):
        import json as _json
        with open(storage_state_path) as f:
            state = _json.load(f)
        cookies = state.get("cookies", [])
        if cookies:
            await _browser_context.add_cookies(cookies)

    return _browser_context


async def close_browser() -> None:
    """Close the shared browser context. Called at workflow teardown."""
    global _playwright_instance, _browser_instance, _browser_context, _ref_map
    _ref_map = {}
    if _browser_context is not None:
        await _browser_context.close()
        _browser_context = None
    if _browser_instance is not None:
        await _browser_instance.close()
        _browser_instance = None
    if _playwright_instance is not None:
        await _playwright_instance.stop()
        _playwright_instance = None


# JavaScript that walks the DOM, assigns data-wf-ref attributes to interactive elements,
# and returns structured metadata for each one.
_EXTRACT_INTERACTIVE_JS = """
() => {
    // Clear old refs first
    document.querySelectorAll('[data-wf-ref]').forEach(el => el.removeAttribute('data-wf-ref'));

    const SELECTORS = [
        'a[href]', 'button', 'input:not([type="hidden"])',
        'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]',
        '[role="radio"]', '[role="menuitem"]', '[role="option"]', '[role="tab"]'
    ];

    const seen = new Set();
    const allEls = Array.from(document.querySelectorAll(SELECTORS.join(',')));
    const unique = allEls.filter(el => !seen.has(el) && seen.add(el));

    const visible = unique.filter(el => {
        const style = window.getComputedStyle(el);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            (el.offsetWidth > 0 || el.offsetHeight > 0)
        );
    });

    return visible.map((el, i) => {
        const ref = 'e' + (i + 1);
        el.setAttribute('data-wf-ref', ref);

        const tag = el.tagName.toLowerCase();
        const inputType = el.getAttribute('type') || tag;
        const ariaRole = el.getAttribute('role');
        const role = ariaRole || (
            tag === 'a' ? 'link' :
            tag === 'button' ? 'button' :
            (tag === 'input' && inputType === 'checkbox') ? 'checkbox' :
            (tag === 'input' && inputType === 'radio') ? 'radio' :
            tag === 'input' ? 'textbox' :
            tag === 'select' ? 'combobox' :
            tag === 'textarea' ? 'textbox' :
            tag
        );

        // Try multiple strategies to find a label
        let label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
        if (!label && el.id) {
            const labelEl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
            if (labelEl) label = labelEl.textContent.trim();
        }
        if (!label) {
            const parentLabel = el.closest('label');
            if (parentLabel) {
                const clone = parentLabel.cloneNode(true);
                clone.querySelectorAll('input, select, textarea, button').forEach(c => c.remove());
                label = clone.textContent.trim();
            }
        }
        if (!label) {
            const txt = el.textContent?.trim() || '';
            label = txt.slice(0, 80);
        }
        if (!label) {
            label = el.getAttribute('name') || el.getAttribute('id') || '';
        }

        const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
        const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
        const name = el.getAttribute('name') || el.getAttribute('id') || '';

        const options = tag === 'select'
            ? Array.from(el.options).map(o => o.text.trim()).filter(Boolean)
            : [];

        return { ref, role, type: inputType, name, label, required, disabled, options };
    });
}
"""


async def _build_snapshot(page: Any, interactive_only: bool = False) -> str:
    """Build an accessibility tree snapshot with [ref=eN] markers."""
    global _ref_map

    elements: list[dict[str, Any]] = await page.evaluate(_EXTRACT_INTERACTIVE_JS)

    # Update ref map: ref -> CSS selector using the data attribute we stamped
    _ref_map = {el["ref"]: _ref_selector(el["ref"]) for el in elements}

    lines: list[str] = []

    if not interactive_only:
        try:
            title = await page.title()
            lines.append(f"[Page: {page.url}]")
            if title:
                lines.append(f"Title: {title}")
            lines.append("")
        except Exception:
            pass

        try:
            body_text = (await page.inner_text("body")).strip()
            lines.append("[Page Content]")
            lines.append(body_text[:3000])
            lines.append("")
        except Exception:
            pass

    lines.append("[Interactive Elements]")
    for el in elements:
        if el.get("disabled"):
            continue
        ref = el["ref"]
        role = el["role"]
        label = (el.get("label") or "").strip()
        typ = el.get("type", "")
        required = el.get("required", False)
        options = el.get("options") or []

        parts = [f"[ref={ref}]", role]
        if label:
            parts.append(f'"{label}"')
        if typ and typ not in (role, "text", "submit", "button"):
            parts.append(f"type={typ}")
        if required:
            parts.append("(required)")
        if options:
            opt_str = ", ".join(options[:10])
            if len(options) > 10:
                opt_str += f", ... ({len(options)} total)"
            parts.append(f"options: [{opt_str}]")

        lines.append("  " + " ".join(parts))

    return "\n".join(lines)


async def browser(args: dict[str, Any]) -> dict[str, Any]:
    """Control a headless Chromium browser.

    Mirrors the OpenClaw browser tool interface.

    Args:
        args: {
            "action": str (required) — one of:
                "navigate"   — go to a URL. Requires: url (str)
                "snapshot"   — accessibility tree with [ref=eN] markers.
                               Optional: interactive (bool) — interactive elements only
                "screenshot" — take a screenshot. Returns: path (str)
                "click"      — click an element. Requires: ref (str, ref or CSS selector)
                "type"       — fill a text field. Requires: ref (str), text (str)
                "fill"       — batch fill fields. Requires: fields (list of {ref, value, type?})
                "select"     — choose dropdown option. Requires: ref (str), values (list[str])
                "upload"     — upload file to file input. Requires: ref (str), path (str)
                "wait"       — wait for condition. Requires: text or url or timeout_ms (int)
                "tabs"       — list open tabs. Returns: tabs (list)
                "open"       — open a new tab. Requires: url (str)
                "close"      — close a tab. Requires: tab_id (int, default: current)
                "status"     — return browser status.
                "evaluate"   — run JavaScript. Requires: fn (str)
            ... action-specific parameters
        }

    Returns:
        Action-specific dict.
    """
    global _ref_map

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
        _ref_map = {}  # refs are stale after navigation
        return {"url": page.url, "status": status}

    elif action == "snapshot":
        selector = args.get("selector")
        if selector:
            try:
                text = await page.locator(selector).first.inner_text()
            except Exception:
                text = ""
            return {"snapshot": text, "url": page.url}

        interactive_only = bool(args.get("interactive", False))
        snapshot_text = await _build_snapshot(page, interactive_only=interactive_only)
        return {"snapshot": snapshot_text, "url": page.url}

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
        selector = _ref_map.get(ref, ref) if _is_ref(ref) else ref
        double = bool(args.get("double", False))
        locator = page.locator(selector).first
        if double:
            await locator.dblclick()
        else:
            await locator.click()
        return {"clicked": True, "ref": ref}

    elif action == "type":
        ref = args.get("ref") or args.get("selector")
        if not isinstance(ref, str):
            raise ValueError('browser type: "ref" or "selector" is required')
        selector = _ref_map.get(ref, ref) if _is_ref(ref) else ref
        text = args.get("text", "")
        if not isinstance(text, str):
            raise ValueError('browser type: "text" must be a string')
        submit = bool(args.get("submit", False))
        locator = page.locator(selector).first
        await locator.fill(text)
        if submit:
            await locator.press("Enter")
        return {"typed": True, "ref": ref}

    elif action == "select":
        ref = args.get("ref") or args.get("selector")
        if not isinstance(ref, str):
            raise ValueError('browser select: "ref" or "selector" is required')
        selector = _ref_map.get(ref, ref) if _is_ref(ref) else ref
        values = args.get("values") or args.get("value")
        if isinstance(values, str):
            values = [values]
        if not values:
            raise ValueError('browser select: "values" or "value" is required')
        locator = page.locator(selector).first
        try:
            await locator.select_option(label=values[0] if len(values) == 1 else values)
        except Exception:
            await locator.select_option(value=values[0] if len(values) == 1 else values)
        return {"selected": True, "ref": ref, "values": values}

    elif action == "fill":
        fields = args.get("fields")
        if not isinstance(fields, list):
            raise ValueError('browser fill: "fields" must be a list of {ref, value, type?}')
        results = []
        for field in fields:
            ref = field.get("ref", "")
            value = str(field.get("value", ""))
            field_type = field.get("type", "text")
            selector = _ref_map.get(ref, ref) if _is_ref(ref) else ref
            try:
                locator = page.locator(selector).first
                if field_type in ("checkbox", "radio"):
                    if value.lower() in ("true", "yes", "1", "on", "checked"):
                        await locator.check()
                    else:
                        await locator.uncheck()
                elif field_type == "select" or field_type == "combobox":
                    try:
                        await locator.select_option(label=value)
                    except Exception:
                        await locator.select_option(value=value)
                else:
                    await locator.fill(value)
                results.append({"ref": ref, "filled": True})
            except Exception as exc:
                results.append({"ref": ref, "filled": False, "error": str(exc)})
        filled_count = sum(1 for r in results if r.get("filled"))
        return {"results": results, "filled": filled_count}

    elif action == "upload":
        ref = args.get("ref") or args.get("selector")
        if not isinstance(ref, str):
            raise ValueError('browser upload: "ref" or "selector" is required')
        path = args.get("path")
        if not isinstance(path, str):
            raise ValueError('browser upload: "path" is required')
        selector = _ref_map.get(ref, ref) if _is_ref(ref) else ref
        path = os.path.expanduser(path)
        locator = page.locator(selector).first
        await locator.set_input_files(path)
        return {"uploaded": True, "ref": ref, "path": path}

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

    elif action == "save_state":
        # Save session state (cookies + local storage) to a JSON file
        path = args.get("path")
        if not isinstance(path, str):
            raise ValueError('browser save_state: "path" is required')
        path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        state = await ctx.storage_state(path=path)
        return {"saved": True, "path": path, "cookies": len(state.get("cookies", []))}

    elif action == "evaluate":
        fn = args.get("fn")
        if not isinstance(fn, str):
            raise ValueError('browser evaluate: "fn" is required')
        result = await page.evaluate(fn)
        return {"result": json.dumps(result) if not isinstance(result, str) else result}

    else:
        raise ValueError(
            f"browser: unknown action {action!r}. "
            "Valid actions: navigate, snapshot, screenshot, click, type, fill, select, "
            "upload, save_state, wait, tabs, open, close, status, evaluate"
        )
