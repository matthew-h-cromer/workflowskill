---
name: branch
description: Conditional branching with then/else paths.
---

# Branch

```workflow
inputs:
  value:
    type: int
outputs:
  result:
    type: string
steps:
  - id: check
    type: tool
    tool: validate
    description: Validate input
    inputs:
      value:
        type: int
        source: $inputs.value
    outputs:
      valid:
        type: boolean

  - id: branch
    type: conditional
    description: Branch on validation result
    condition: $steps.check.output.valid == true
    inputs: {}
    outputs: {}
    then:
      - exit_success
    else:
      - exit_failed

  - id: exit_success
    type: exit
    description: Validation passed
    status: success
    output: $steps.check.output
    inputs: {}
    outputs: {}

  - id: exit_failed
    type: exit
    description: Validation failed
    status: failed
    output: $steps.check.output
    inputs: {}
    outputs: {}
```
