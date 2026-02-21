---
name: error-ignore
description: Tool fails with on_error ignore - continues with null output.
---

# Error Ignore

```workflow
inputs: {}
outputs:
  result:
    type: string
steps:
  - id: failing_tool
    type: tool
    tool: unreliable_api
    description: This tool will fail but we continue
    on_error: ignore
    inputs: {}
    outputs:
      data:
        type: object

  - id: process
    type: transform
    operation: map
    description: Receives null from failed step
    inputs:
      data:
        type: object
        source: $steps.failing_tool.output.data
    outputs:
      result:
        type: string
    expression:
      value: $item.name
```
