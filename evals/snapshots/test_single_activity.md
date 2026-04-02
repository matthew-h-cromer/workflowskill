---
type: workflow
name: check-status
description: Fetches a URL and returns its HTTP status code and content.
actions: [web.api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  status_code:
    type: int
    description: "HTTP status code returned by the server"
  content:
    type: str
    description: "Response body content"
---

# Check Status

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the target URL
response = await workflow.execute_activity(
    "web.api",
    {"url": url, "method": "GET"},
)

return {
    "status_code": response["status_code"],
    "content": response["content"],
}
```
