---
type: workflow
name: retry-fetch
description: Fetch a URL via the api action with exponential-backoff retry logic.
inputs:
  url:
    type: str
outputs:
  content:
    type: str
    description: "The raw response body from the URL"
  content_type:
    type: str
    description: "The Content-Type header of the response"
  status:
    type: int
    description: "The HTTP status code of the response"
  url:
    type: str
    description: "The final URL that was fetched"
---

# Retry Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL with exponential-backoff retry
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
    "content_type": result["content_type"],
    "status": result["status"],
    "url": result["url"],
}
```
