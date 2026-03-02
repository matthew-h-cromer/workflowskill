---
name: greeting-with-input
description: Accepts a name input and returns a greeting like "Hello, <name>!"
---

# Greeting With Input

```workflow
inputs:
  name:
    type: string
    default: "World"

outputs:
  greeting:
    type: string

steps:
  - id: greet
    type: exit
    status: success
    output:
      greeting: "Hello, ${inputs.name}!"
    inputs: {}
    outputs: {}
```
