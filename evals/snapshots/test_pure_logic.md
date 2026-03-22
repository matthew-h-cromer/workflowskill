---
type: workflow
name: greet
description: Returns a greeting message for the given name
inputs:
  name:
    type: str
    default: "World"
outputs:
  greeting:
    type: str
    description: "The greeting message"
---

# Greet

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
return {"greeting": f"Hello, {name}!"}
```
