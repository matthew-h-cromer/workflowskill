---
type: workflow
name: resilient-fetch
description: Fetches a URL with automatic retries and returns a structured result on success or failure.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  success:
    type: bool
    description: "True if the request succeeded, False if all retries were exhausted"
  body:
    type: str
    description: "The response body on success, omitted on failure"
  error:
    type: str
    description: "The error message on failure, omitted on success"
---

# Resilient Fetch

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
try:
    # Fetch the URL, retrying up to 3 times on failure
    result = await workflow.execute_activity(
        "api",
        {"url": url},
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=2),
            backoff_coefficient=2.0,
        ),
    )
    return {"success": True, "body": result["body"]}

except Exception as e:
    # All retries exhausted — return a structured error
    return {"success": False, "error": str(e)}
```
