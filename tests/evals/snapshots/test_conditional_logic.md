---
name: check-url
description: Checks a URL and returns ok if the response status is 200, otherwise returns error with the status code.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  status:
    type: str
    description: "ok if status code is 200, error otherwise"
  code:
    type: int
    description: "The HTTP status code, present only when status is error"
---

# Check URL

Fetches a URL using a raw HTTP request and returns whether the response was successful.

```python
response = await workflow.execute_activity(
    "web_fetch_raw",
    {"url": url},
)

status_code = response["status"]

if status_code == 200:
    return {"status": "ok"}
else:
    return {"status": "error", "code": status_code}
```