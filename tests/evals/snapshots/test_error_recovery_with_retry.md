---
name: resilient-fetch
description: Fetches a URL with retry logic and returns structured success or error output.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  success:
    type: bool
    description: "True if the fetch succeeded, False otherwise"
  content:
    type: str
    description: "Page content on success, empty string on failure"
  error:
    type: str
    description: "Error message on failure, empty string on success"
---

# Resilient Fetch

Fetches a URL using `web_fetch` with a retry policy of up to 3 attempts and
exponential backoff. If all attempts are exhausted, returns a structured error
dict instead of raising.

```python
try:
    result = await workflow.execute_activity(
        "web_fetch",
        {"url": url, "extract": "markdown"},
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=2),
            backoff_coefficient=2.0,
        ),
    )
    return {"success": True, "content": result["content"], "error": ""}
except Exception as e:
    return {"success": False, "content": "", "error": str(e)}
```