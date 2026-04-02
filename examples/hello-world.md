---
type: workflow
name: Hello World
description: "See WorkflowSkill in action — run this to get a personalized greeting and confirm your setup is working."
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
