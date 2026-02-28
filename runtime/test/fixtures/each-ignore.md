---
name: each-ignore
description: Tool step with each iteration and on_error ignore — failed iterations produce null, others succeed.
---

# Each Ignore

```workflow
inputs:
  items:
    type: array
outputs:
  results:
    type: array
    value: $steps.process.output
steps:
  - id: process
    type: tool
    tool: flaky_tool
    on_error: ignore
    each: $inputs.items
    inputs:
      item:
        type: string
        value: $item
    outputs:
      result:
        type: string
        value: $result.result
```
