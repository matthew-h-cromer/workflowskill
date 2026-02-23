---
name: output-source
description: Tests step output source mapping with $result and workflow output source with $steps.
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
    value: $steps.fetch.output.title
  user_id:
    type: int
    value: $steps.fetch.output.user_id

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        value: $inputs.url
    outputs:
      title:
        type: string
        value: $result.body.title
      user_id:
        type: int
        value: $result.body.userId
```
