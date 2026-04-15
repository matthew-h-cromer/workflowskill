---
version: 1
name: while-loop
description: While loop that runs once and doubles the input
inputs:
  count:
    type: number
steps:
  - id: loop
    description: While count is positive, double the input value
    type: while
    when: "input.count > 0"
    max_iterations: 1
    body:
      - id: result
        description: Multiply count by two
        type: transform
        expr: "input.count * 2"
outputs:
  doubled: "{{ steps.result.output }}"
---

Run a while loop that doubles the input value on its single iteration.
