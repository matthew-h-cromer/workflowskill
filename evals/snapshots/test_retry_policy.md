---
type: workflow
name: retry-fetch
description: Fetch a URL via HTTP with an exponential-backoff retry policy.
actions: [api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  content:
    type: str
    description: "The response body"
  url:
    type: str
    description: "The resolved URL"
  content_type:
    type: str
    description: "The response content type"
  status:
    type: int
    description: "The HTTP status code"
---

# Retry Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL with exponential-backoff retries
result = await workflow.execute_activity(
    "api",
    {"url": url},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)

return {
    "content": result["content"],
    "url": result["url"],
    "content_type": result["content_type"],
    "status": result["status"],
}
```
