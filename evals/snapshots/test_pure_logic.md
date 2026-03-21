---
type: workflow
name: greet
description: Returns a personalized greeting for the given name.
inputs:
  name:
    type: str
    default: "World"
outputs:
  greeting:
    type: str
    description: "The personalized greeting message"
---

# Greet

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
return {"greeting": f"Hello, {name}!"}
```
