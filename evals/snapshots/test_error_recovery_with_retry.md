---
type: workflow
name: resilient-fetch
description: Fetch a URL via the api action with retry logic and graceful error handling.
actions: [api]
inputs:
  url:
    type: str
    description: "The URL to fetch"
outputs:
  success:
    type: bool
    description: "Whether the fetch succeeded"
  content:
    type: str
    description: "Response body on success"
  content_type:
    type: str
    description: "Content-Type header value on success"
  status:
    type: int
    description: "HTTP status code on success"
  error:
    type: str
    description: "Error message on failure"
---

# Resilient Fetch

## Usage

Run this workflow using the run_workflow tool

## Details

Fetches a URL using the `api` action with up to 3 attempts (exponential backoff:
2 s → 4 s). If all attempts fail, returns `success: false` and an `error`
message instead of raising — so callers always receive a well-formed dict.

## Workflow

```python
try:
    # Fetch the URL with automatic retries
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
        "success": True,
        "content": result["content"],
        "content_type": result["content_type"],
        "status": result["status"],
        "error": None,
    }
except Exception as e:
    # All retry attempts exhausted — return a safe error dict
    return {
        "success": False,
        "content": None,
        "content_type": None,
        "status": None,
        "error": str(e),
    }
```
