---
name: safe-fetch
description: Fetches a URL and returns the content, or a structured error if the request fails.
inputs:
  url:
    type: str
outputs:
  success:
    type: bool
    description: "True if the request succeeded, False otherwise"
  content:
    type: str
    description: "The response content on success"
  error:
    type: str
    description: "The error message on failure"
---

# Safe Fetch

Fetches a URL and returns its content. If anything goes wrong, returns a
structured error instead of raising an exception.

```python
try:
    # Fetch the URL
    result = await workflow.execute_activity(
        "api",
        {"url": url},
    )
    return {"success": True, "content": result["body"]}
except Exception as e:
    return {"success": False, "error": str(e)}
```
