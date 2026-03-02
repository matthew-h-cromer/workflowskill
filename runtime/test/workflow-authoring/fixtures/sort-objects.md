---
name: sort-objects-by-score
description: Accepts a list of objects with a score field, sorts them by score descending, and returns the sorted list
---

# Sort Objects By Score

```workflow
inputs:
  items:
    type: array

outputs:
  sorted_items:
    type: array
    value: $steps.sort_by_score.output.items

steps:
  - id: sort_by_score
    type: transform
    operation: sort
    field: score
    direction: desc
    inputs:
      items:
        type: array
        value: $inputs.items
    outputs:
      items:
        type: array
```
