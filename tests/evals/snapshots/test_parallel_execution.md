---
name: fetch-two
description: Fetches two URLs concurrently and returns both results.
inputs:
  url_a:
    type: str
    default: "https://example.com"
  url_b:
    type: str
    default: "https://example.org"
outputs:
  content_a:
    type: str
    description: "Content fetched from url_a"
  content_b:
    type: str
    description: "Content fetched from url_b"
---

# Fetch Two

Fetches two URLs in parallel using `asyncio.gather` and returns the markdown
content of each.

```python
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("web_fetch", {"url": url_a, "extract": "markdown"}),
    workflow.execute_activity("web_fetch", {"url": url_b, "extract": "markdown"}),
)

return {
    "content_a": result_a["content"],
    "content_b": result_b["content"],
}
```