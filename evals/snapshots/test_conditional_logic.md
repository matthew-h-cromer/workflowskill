---
type: workflow
name: check-url
description: Checks a URL and returns ok if the status is 200, otherwise returns an error with the status code.
inputs:
  url:
    type: str
outputs:
  status:
    type: str
    description: "ok if the URL returned 200, otherwise error"
  code:
    type: int
    description: "The HTTP status code (only present when status is error)"
---

# Check URL

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL and capture the HTTP response
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

# Return ok for 200, otherwise return error with the code
if result["status"] == 200:
    return {"status": "ok"}
return {"status": "error", "code": result["status"]}
```
