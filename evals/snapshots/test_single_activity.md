---
type: workflow
name: check-status
description: Fetches a URL and returns the HTTP status code and response content.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: int
    description: "HTTP status code returned by the URL"
  body:
    type: str
    description: "Response content returned by the URL"
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

return {"status": result["status"], "body": result["body"]}
```
