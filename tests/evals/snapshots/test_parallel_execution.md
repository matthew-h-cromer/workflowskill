---
name: fetch-two
description: Fetches two URLs concurrently and returns both responses.
inputs:
  url_a:
    type: str
    default: "https://example.com"
  url_b:
    type: str
    default: "https://example.com"
outputs:
  result_a:
    type: dict
    description: "Response from the first URL"
  result_b:
    type: dict
    description: "Response from the second URL"
---

# Fetch Two

Calls two URLs at the same time and returns both responses.

```python
# Fetch both URLs in parallel
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("api", {"url": url_a}),
    workflow.execute_activity("api", {"url": url_b}),
)

return {"result_a": result_a, "result_b": result_b}
```
