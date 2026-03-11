---
name: safe-fetch
description: Fetches a URL and returns its content, or an error message if the fetch fails.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  success:
    type: bool
    description: "True if the fetch succeeded, False otherwise"
  content:
    type: str
    description: "Page content on success"
  error:
    type: str
    description: "Error message on failure"
---

# Safe Fetch

Attempts to fetch a URL and returns its markdown content. If any error occurs
during the fetch, returns a failure response with the error message instead of
raising an exception.

```python
try:
    result = await workflow.execute_activity(
        "web_fetch",
        {"url": url, "extract": "markdown"},
    )
    return {"success": True, "content": result["content"]}
except Exception as e:
    return {"success": False, "error": str(e)}
```