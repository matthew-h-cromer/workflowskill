---
type: workflow
name: fetch-two
description: Fetches two URLs concurrently using web.api and returns both results.
actions: [web.api]
inputs:
  url_a:
    type: str
    description: "First URL to fetch"
  url_b:
    type: str
    description: "Second URL to fetch"
outputs:
  result_a:
    type: dict
    description: "Response from url_a"
  result_b:
    type: dict
    description: "Response from url_b"
---

# Fetch Two

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch both URLs concurrently
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("web.api", {"url": url_a}),
    workflow.execute_activity("web.api", {"url": url_b}),
)

return {"result_a": result_a, "result_b": result_b}
```
