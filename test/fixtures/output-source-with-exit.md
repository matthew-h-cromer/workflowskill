---
name: output-source-with-exit
description: Tests that exit output takes precedence over workflow output source.
---

# Output Source With Exit Test

```workflow
inputs:
  should_exit:
    type: boolean
    value: false

outputs:
  message:
    type: string
    value: $steps.fetch.output.title
  count:
    type: int
    value: $steps.fetch.output.count

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        value: "https://api.example.com/data"
    outputs:
      title:
        type: string
        value: $result.body.title
      count:
        type: int
        value: $result.body.items.length

  - id: early_exit
    type: exit
    condition: $inputs.should_exit
    status: success
    output:
      message: "exited early"
      count: 0
```
