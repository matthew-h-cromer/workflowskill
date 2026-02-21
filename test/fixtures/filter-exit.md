---
name: filter-exit
description: Transform filter with conditional and early exit.
---

# Filter Exit

```workflow
inputs:
  threshold:
    type: int
    default: 7
outputs:
  urgent:
    type: array
steps:
  - id: fetch
    type: tool
    tool: get_items
    description: Fetch items
    inputs: {}
    outputs:
      items:
        type: array

  - id: filter_high
    type: transform
    operation: filter
    description: Keep items above threshold
    inputs:
      items:
        type: array
        source: $steps.fetch.output.items
    outputs:
      filtered:
        type: array
    where: $item.score >= $inputs.threshold

  - id: check_empty
    type: conditional
    description: Check if any urgent items
    condition: $steps.filter_high.output.filtered.length == 0
    inputs: {}
    outputs: {}
    then:
      - exit_empty
    else:
      - exit_success

  - id: exit_empty
    type: exit
    description: No urgent items
    status: success
    output: $steps.filter_high.output.filtered
    inputs: {}
    outputs: {}

  - id: exit_success
    type: exit
    description: Return urgent items
    status: success
    output: $steps.filter_high.output.filtered
    inputs: {}
    outputs: {}
```
