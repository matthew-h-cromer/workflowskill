---
type: workflow
name: check-url
description: Checks a URL and returns ok if the status code is 200, otherwise returns error with the code.
actions: [api]
inputs:
  url:
    type: str
    description: "The URL to check"
outputs:
  status:
    type: str
    description: "'ok' if the server returned 200, otherwise 'error'"
  code:
    type: int
    description: "The HTTP status code (only present when status is 'error')"
---

# Check URL

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL and inspect the HTTP status code
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

if result["status"] == 200:
    return {"status": "ok"}

return {"status": "error", "code": result["status"]}
```
