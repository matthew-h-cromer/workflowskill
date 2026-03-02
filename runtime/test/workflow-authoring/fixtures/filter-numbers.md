---
name: filter-even-numbers
description: Accepts a list of numbers, filters to keep only even ones, and returns the filtered list
---

# Filter Even Numbers

```workflow
inputs:
  numbers:
    type: array

outputs:
  even_numbers:
    type: array
    value: $steps.filter_even.output.items

steps:
  - id: filter_even
    type: transform
    operation: filter
    where: $item % 2 == 0
    inputs:
      items:
        type: array
        value: $inputs.numbers
    outputs:
      items:
        type: array
```
