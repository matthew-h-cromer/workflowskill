---
name: check-status
description: Fetches a URL and returns its HTTP status code and response content.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: int
    description: "HTTP status code returned by the URL"
  body:
    type: str
    description: "Response content returned by the URL"
---

# Check Status

Fetches the given URL and returns the HTTP status code along with the response content.

```python
# Fetch the URL
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

return {"status": result["status"], "body": result["body"]}
```
