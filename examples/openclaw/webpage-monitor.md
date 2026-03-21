---
type: workflow
name: webpage-monitor
description: Fetch a webpage and extract key information, using the browser for JavaScript-heavy pages.
inputs:
  url:
    type: str
    default: "https://news.ycombinator.com"
  use_browser:
    type: bool
    default: false
outputs:
  title:
    type: str
    description: "Page title or heading"
  summary:
    type: str
    description: "Brief summary of the page content"
  url:
    type: str
    description: "Final URL after any redirects"
---

# Webpage Monitor

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
if use_browser:
    # Use browser for JavaScript-rendered pages
    await workflow.execute_activity(
        "browser",
        {"action": "navigate", "url": url},
        start_to_close_timeout=timedelta(seconds=30),
    )
    snap = await workflow.execute_activity(
        "browser",
        {"action": "snapshot"},
        start_to_close_timeout=timedelta(seconds=15),
    )
    content = snap["snapshot"]
    final_url = url
else:
    # Use web_fetch for static pages (faster, no browser overhead)
    page = await workflow.execute_activity(
        "web_fetch",
        {"url": url, "maxChars": 8000},
        start_to_close_timeout=timedelta(seconds=30),
    )
    content = page["content"]
    final_url = page["url"]

if not content.strip():
    return {"title": "", "summary": "Page returned no content.", "url": final_url}

# Extract title and summarize
result = await workflow.execute_activity(
    "llm_task",
    {
        "prompt": "Extract the page title and write a 1-2 sentence summary of the main content.",
        "input": content[:5000],
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
            },
            "required": ["title", "summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=30),
)

return {"title": result["title"], "summary": result["summary"], "url": final_url}
```
