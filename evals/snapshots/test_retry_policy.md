---
type: workflow
name: retry-fetch
description: Fetches a URL via web.api with exponential-backoff retry logic.
actions: [web.api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  result:
    type: dict
    description: "The response returned by web.api"
---

# Retry Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch the URL with exponential-backoff retry
result = await workflow.execute_activity(
    "web.api",
    {"url": url},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)

return {"result": result}
```
