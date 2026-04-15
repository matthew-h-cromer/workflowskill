---
version: 1
name: filter-and-double-numbers
description: "Filters a list of numbers to only those greater than 10, then doubles each one and returns the result."
inputs:
  numbers:
    type: array
    description: "The list of numbers to process"
outputs:
  result: "{{ steps.filter_and_double.output }}"
steps:
  - id: filter_and_double
    description: Filter numbers greater than 10 and double each one
    type: transform
    expr: "$map(input.numbers[$ > 10], function($n){ $n * 2 })[]"
---

Filters a list of input numbers to keep only those greater than 10, then doubles each surviving number and returns the resulting array.

No external integrations are used — this is a pure in-memory transformation powered by a single JSONata expression.
