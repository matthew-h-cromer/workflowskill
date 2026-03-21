---
type: workflow
name: check-status
description: Fetch a URL and return its HTTP status code and content.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: int
    description: "HTTP status code returned by the URL"
  content:
    type: str
    description: "Response body content from the URL"
---

# Check Status

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL and capture the response
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

return {"status": result["status"], "content": result["content"]}
```
