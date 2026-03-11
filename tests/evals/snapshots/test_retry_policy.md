---
name: retry-fetch
description: Fetches a URL with a retry policy of up to 3 attempts and exponential backoff.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  content:
    type: str
    description: "The fetched page content as markdown"
  url:
    type: str
    description: "The final URL after redirects"
---

# Retry Fetch

Fetches a URL using `web_fetch` with a retry policy of up to 3 attempts,
exponential backoff starting at 2 seconds, and a backoff coefficient of 2.0.

```python
result = await workflow.execute_activity(
    "web_fetch",
    {"url": url, "extract": "markdown"},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)
return {"content": result["content"], "url": result["url"]}
```