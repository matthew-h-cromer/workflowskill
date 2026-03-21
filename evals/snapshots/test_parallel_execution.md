---
type: workflow
name: fetch-two
description: Fetch two URLs concurrently and return both responses.
inputs:
  url_a:
    type: str
  url_b:
    type: str
outputs:
  content_a:
    type: str
    description: "Response body from url_a"
  content_b:
    type: str
    description: "Response body from url_b"
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
    "content_a": result_a["content"],
    "content_b": result_b["content"],
}
```
