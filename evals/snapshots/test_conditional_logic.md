---
type: workflow
name: check-url
description: Checks a URL and returns ok if it responds successfully, or an error with the status code otherwise.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: str
    description: "ok if the URL responded successfully, error otherwise"
  code:
    type: int
    description: "The HTTP status code, included only when status is error"
---

# Check URL

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL and inspect the response
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

# Return ok for 200, otherwise surface the error code
if result["status"] == 200:
    return {"status": "ok"}

return {"status": "error", "code": result["status"]}
```
