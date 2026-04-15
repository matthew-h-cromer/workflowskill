---
version: 1
name: return
description: Explicit return value
inputs:
  x:
    type: number
  y:
    type: number
steps:
  - id: sum
    description: Add x and y together
    type: transform
    expr: "input.x + input.y"
  - id: total
    description: Return the total as a structured object
    type: return
    value: '{{ {"total": steps.sum.output} }}'
---

Sum two inputs and return the result as a structured object.
