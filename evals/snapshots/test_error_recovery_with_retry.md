---
type: workflow
name: resilient-fetch
description: Fetches a URL via web.api with up to 3 attempts, returning a structured error dict on final failure.
actions: [web.api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  success:
    type: bool
    description: "Whether the request succeeded"
  data:
    type: dict
    description: "Response payload on success"
  error:
    type: str
    description: "Error message on failure (only present when success is false)"
---

# Resilient Fetch

## Usage

Run this workflow using the run_workflow tool

## Details

Fetches a URL using the `web.api` action with a retry policy of up to 3 attempts
(exponential backoff: 2 s → 4 s). If all attempts are exhausted, the workflow
returns gracefully with `success: false` and an `error` message rather than
raising an exception to the caller.

## Workflow

```python
try:
    # Fetch the URL with automatic retries
    result = await workflow.execute_activity(
        "web.api",
        {"url": url},
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=2),
            backoff_coefficient=2.0,
        ),
    )
    return {"success": True, "data": result}
except Exception as e:
    # All retry attempts exhausted — return structured error
    return {"success": False, "data": {}, "error": str(e)}
```
