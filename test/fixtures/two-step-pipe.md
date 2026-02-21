---
name: two-step-pipe
description: Tool step piped to transform step via $steps references.
---

# Two Step Pipe

```workflow
inputs:
  query:
    type: string
outputs:
  result:
    type: array
steps:
  - id: fetch
    type: tool
    tool: search
    description: Fetch search results
    inputs:
      query:
        type: string
        source: $inputs.query
    outputs:
      results:
        type: array

  - id: reshape
    type: transform
    operation: map
    description: Reshape results
    inputs:
      items:
        type: array
        source: $steps.fetch.output.results
    outputs:
      mapped:
        type: array
    expression:
      title: $item.title
      url: $item.url
```
