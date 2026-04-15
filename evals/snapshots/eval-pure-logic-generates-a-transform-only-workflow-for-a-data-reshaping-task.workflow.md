---
version: 1
name: filter-and-double
description: "Filters a list of numbers to only those greater than 10, then doubles each one."
inputs:
  numbers:
    type: array
    description: "List of numbers to filter and transform"
outputs:
  result: "{{ steps.double.output }}"
steps:
  - id: filter
    description: Filter numbers to only those greater than 10
    type: transform
    expr: "input.numbers[$ > 10]"

  - id: double
    description: Double each number that passed the filter
    type: transform
    expr: "steps.filter.output * 2"
---

Filters an input list of numbers, keeping only values greater than 10, then doubles each qualifying number. Returns the resulting array.

## How it works

1. **Filter** — Uses a JSONata array filter (`[$ > 10]`) to keep only numbers greater than 10 from the input array.
2. **Double** — Multiplies every remaining number by 2. JSONata automatically maps the `* 2` operation across the entire array.

## Example

**Input:**
```json
{ "numbers": [3, 11, 7, 25, 10, 42] }
```

**Output:**
```json
{ "result": [22, 50, 84] }
```

No external integrations or credentials are required — this workflow is pure data transformation.
