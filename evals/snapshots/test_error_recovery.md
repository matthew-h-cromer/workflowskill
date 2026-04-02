---
type: workflow
name: safe-fetch
description: Fetches a URL via web.api and returns success/failure without raising.
actions: [web.api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  success:
    type: bool
    description: "Whether the fetch succeeded"
  content:
    type: str
    description: "Response content on success"
  error:
    type: str
    description: "Error message on failure"
---

# Safe Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
try:
    # Fetch the target URL
    result = await workflow.execute_activity(
        "web.api",
        {"url": url},
    )
    return {"success": True, "content": result["content"]}
except Exception as e:
    return {"success": False, "error": str(e)}
```
