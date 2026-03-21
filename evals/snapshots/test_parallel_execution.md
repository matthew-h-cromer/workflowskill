---
type: workflow
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
  body_a:
    type: str
    description: "Response body from the first URL"
  body_b:
    type: str
    description: "Response body from the second URL"
---

# Fetch Two

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch both URLs at the same time
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("api", {"url": url_a}),
    workflow.execute_activity("api", {"url": url_b}),
)

return {"body_a": result_a["body"], "body_b": result_b["body"]}
```
