---
type: workflow
name: hello-world
description: Return a greeting.
inputs:
  name:
    type: str
    default: "World"
outputs:
  message:
    type: str
---

## Usage

Run this workflow using the run_workflow tool.

## Workflow

```python
return {"message": f"Hello, {name}!"}
```
