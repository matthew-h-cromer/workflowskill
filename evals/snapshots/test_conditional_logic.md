---
type: workflow
name: check-url
description: Fetches a URL and returns ok if the status code is 200, otherwise returns error with the code.
actions: [web.api]
inputs:
  url:
    type: str
    description: "The URL to check"
outputs:
  status:
    type: str
    description: "ok if HTTP 200, otherwise error"
  code:
    type: int
    description: "The HTTP status code (only present when status is error)"
---

# Check URL

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the target URL
response = await workflow.execute_activity(
    "web.api",
    {"url": url, "method": "GET"},
)

# Return ok for 200, error with code otherwise
if response["status"] == 200:
    return {"status": "ok"}
return {"status": "error", "code": response["status"]}
```
