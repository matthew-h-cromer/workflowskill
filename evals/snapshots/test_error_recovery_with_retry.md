---
type: workflow
name: resilient-fetch
description: Fetch a URL via the api action with retry logic and structured error handling.
inputs:
  url:
    type: str
outputs:
  success:
    type: bool
    description: "Whether the fetch succeeded"
  content:
    type: str
    description: "Response body on success"
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

## Workflow

```python
try:
    # Fetch the URL with up to 3 attempts
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
        "status": result["status"],
    }
except Exception as e:
    # All retry attempts exhausted — return structured error
    return {
        "success": False,
        "error": str(e),
    }
```
