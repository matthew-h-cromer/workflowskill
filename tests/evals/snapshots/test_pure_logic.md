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
    description: "The personalized greeting message"
---

# Greet

Returns a friendly greeting for whoever you name.

```python
return {"greeting": f"Hello, {name}!"}
```
