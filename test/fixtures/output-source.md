---
name: output-source
description: Tests step output source mapping with $output and workflow output source with $steps.
---

# Output Source Test

```workflow
inputs:
  url:
    type: string
    default: "https://api.example.com/todos/1"

outputs:
  title:
    type: string
    source: $steps.fetch.output.title
  user_id:
    type: int
    source: $steps.fetch.output.user_id

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        source: $inputs.url
    outputs:
      title:
        type: string
        source: $output.body.title
      user_id:
        type: int
        source: $output.body.userId
```
