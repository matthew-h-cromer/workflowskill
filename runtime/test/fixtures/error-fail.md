---
name: error-fail
description: Tool fails with on_error fail - halts workflow.
---

# Error Fail

```workflow
inputs: {}
outputs:
  result:
    type: string
steps:
  - id: failing_tool
    type: tool
    tool: unreliable_api
    description: This tool will fail
    on_error: fail
    inputs: {}
    outputs:
      data:
        type: object

  - id: process
    type: transform
    operation: map
    description: This should not run
    inputs:
      data:
        type: object
        value: $steps.failing_tool.output.data
    outputs:
      result:
        type: string
    expression:
      value: $item.name
```
