---
version: 1
name: nested-scoping
description: Foreach body accesses an outer scope step
inputs:
  base:
    type: number
steps:
  - id: multiplier
    description: Compute the multiplier from the base input
    type: transform
    expr: "input.base * 3"
  - id: items
    description: For each index, scale it by the outer multiplier
    type: foreach
    items: "{{ [1, 2, 3] }}"
    as: n
    body:
      - id: scaled
        description: Multiply the current index by the outer multiplier
        type: transform
        expr: "n * steps.multiplier.output"
outputs:
  results: "{{ steps.items.output }}"
---

Demonstrate that foreach body steps can read steps defined in the outer scope.
