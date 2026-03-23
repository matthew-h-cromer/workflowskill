---
type: workflow
name: fetch-two
description: Fetch two URLs concurrently and return both responses.
actions: [api]
inputs:
  url_a:
    type: str
    description: "First URL to fetch"
  url_b:
    type: str
    description: "Second URL to fetch"
outputs:
  result_a:
    type: str
    description: "Response content from url_a"
  result_b:
    type: str
    description: "Response content from url_b"
---

# Fetch Two

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Fetch both URLs concurrently
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("api", {"url": url_a}),
    workflow.execute_activity("api", {"url": url_b}),
)

return {
    "result_a": result_a["content"],
    "result_b": result_b["content"],
}
```
