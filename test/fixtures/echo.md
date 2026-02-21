---
name: echo
description: Simplest workflow - one transform step that passes input to output.
---

# Echo Workflow

```workflow
inputs:
  message:
    type: string
    default: "hello"
outputs:
  result:
    type: string
steps:
  - id: echo
    type: transform
    operation: map
    description: Pass input through
    inputs:
      data:
        type: string
        source: $inputs.message
    outputs:
      mapped:
        type: string
    expression:
      value: $item
```
