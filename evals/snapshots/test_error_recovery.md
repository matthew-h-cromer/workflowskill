---
type: workflow
name: safe-fetch
description: Fetch a URL via the api action and return success/failure with content or error message.
inputs:
  url:
    type: str
outputs:
  success:
    type: bool
    description: "Whether the fetch succeeded"
  content:
    type: str
    description: "The response content on success"
  error:
    type: str
    description: "The error message on failure"
---

# Safe Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
try:
    # Attempt to fetch the URL
    result = await workflow.execute_activity(
        "api",
        {"url": url},
    )
    return {"success": True, "content": result["content"]}
except Exception as e:
    return {"success": False, "error": str(e)}
```
