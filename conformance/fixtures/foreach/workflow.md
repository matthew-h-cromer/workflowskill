---
version: 1
name: foreach
description: Iterate items and double each value
inputs:
  numbers:
    type: array
outputs:
  results: "{{ steps.doubled.output }}"
steps:
  - id: doubled
    description: For each number, double its value
    type: foreach
    items: "{{ input.numbers }}"
    as: num
    body:
      - id: double
        description: Multiply the number by two
        type: transform
        expr: "num * 2"
---

Iterate over a list of numbers and double each one.
