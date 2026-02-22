---
name: output-source-with-exit
description: Tests that exit output takes precedence over workflow output source.
---

# Output Source With Exit Test

```workflow
inputs:
  should_exit:
    type: boolean
    default: false

outputs:
  message:
    type: string
    source: $steps.fetch.output.title
  count:
    type: int
    source: $steps.fetch.output.count

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        default: "https://api.example.com/data"
    outputs:
      title:
        type: string
        source: $output.body.title
      count:
        type: int
        source: $output.body.items.length

  - id: early_exit
    type: exit
    condition: $inputs.should_exit
    status: success
    output:
      message: "exited early"
      count: 0
```
