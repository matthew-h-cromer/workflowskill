---
name: greet
description: Returns a personalized greeting for the given name.
inputs:
  name:
    type: str
    default: "World"
outputs:
  greeting:
    type: str
    description: "The greeting message."
---

# Greet

Returns a simple greeting message for the provided name using pure Python logic.

```python
return {"greeting": f"Hello, {name}!"}
```