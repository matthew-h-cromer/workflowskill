---
name: resilient-fetch
description: Fetches a URL with automatic retries and returns the response or a structured error on failure.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  success:
    type: bool
    description: "True if the request succeeded, False if it failed after all retries"
  body:
    type: str
    description: "The response body on success, empty string on failure"
  error:
    type: str
    description: "The error message on failure, empty string on success"
---

# Resilient Fetch

Calls a URL and automatically retries up to 3 times on failure. If all attempts
are exhausted, returns a structured error instead of crashing.

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
    return {"success": True, "body": result["body"], "error": ""}
except Exception as e:
    return {"success": False, "body": "", "error": str(e)}
```
