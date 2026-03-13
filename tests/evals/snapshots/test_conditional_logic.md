---
name: check-url
description: Checks a URL and returns ok if it responds successfully, or an error with the status code otherwise.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: str
    description: "ok if the URL responded successfully, error otherwise"
  code:
    type: int
    description: "The HTTP status code, present only when status is error"
---

# Check URL

Fetches a URL and returns whether it responded successfully.

```python
# Fetch the URL
result = await workflow.execute_activity(
    "api",
    {"url": url},
)

# Check the response status
if result["status"] == 200:
    return {"status": "ok"}

return {"status": "error", "code": result["status"]}
```
