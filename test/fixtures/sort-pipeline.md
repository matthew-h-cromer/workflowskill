---
name: sort-pipeline
description: Multi-transform chain - sort then map.
---

# Sort Pipeline

```workflow
inputs: {}
outputs:
  result:
    type: array
steps:
  - id: fetch
    type: tool
    tool: get_records
    description: Fetch records
    inputs: {}
    outputs:
      records:
        type: array

  - id: sort_by_score
    type: transform
    operation: sort
    description: Sort records by score descending
    inputs:
      items:
        type: array
        value: $steps.fetch.output.records
    outputs:
      sorted:
        type: array
    field: score
    direction: desc

  - id: reshape
    type: transform
    operation: map
    description: Reshape sorted records
    inputs:
      items:
        type: array
        value: $steps.sort_by_score.output.sorted
    outputs:
      mapped:
        type: array
    expression:
      name: $item.name
      score: $item.score
```
