---
version: 1
name: transform
description: JSONata reshaping
inputs:
  items:
    type: array
outputs:
  result: "{{ steps.filtered.output }}"
steps:
  - id: filtered
    description: Filter items with value > 2 and extract labels
    type: transform
    expr: "input.items[value > 2].label"
---

Filter an array of items by value and return their labels.
