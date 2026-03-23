---
type: workflow
name: check-status
description: Fetch a URL and return its HTTP status code and content.
actions: [api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  status:
    type: int
    description: "HTTP status code returned by the URL"
  content:
    type: str
    description: "Response body content"
---

# Check Status

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL and return status and content
result = await workflow.execute_activity(
    "api",
    {"url": url},
)
return {"status": result["status"], "content": result["content"]}
```
