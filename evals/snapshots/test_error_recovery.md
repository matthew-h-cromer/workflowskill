---
type: workflow
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
    description: "The response body on success"
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
    return {"success": True, "content": result["body"]}
except Exception as e:
    return {"success": False, "error": str(e)}
```
