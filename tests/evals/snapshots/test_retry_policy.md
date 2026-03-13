---
name: retry-fetch
description: Fetches a URL with automatic retries on failure.
inputs:
  url:
    type: str
outputs:
  status:
    type: int
    description: "HTTP status code returned by the URL"
  body:
    type: str
    description: "Response body returned by the URL"
---

# Retry Fetch

Fetches a URL and automatically retries up to 3 times if something goes wrong,
waiting longer between each attempt.

```python
# Fetch the URL with retry logic
result = await workflow.execute_activity(
    "api",
    {"url": url},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)

return {"status": result["status"], "body": result["body"]}
```
