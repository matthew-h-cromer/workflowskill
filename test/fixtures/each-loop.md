---
name: each-loop
description: LLM step with each iteration over array items.
---

# Each Loop

```workflow
inputs:
  items:
    type: array
outputs:
  summaries:
    type: array
steps:
  - id: fetch
    type: tool
    tool: get_documents
    description: Fetch documents
    inputs:
      items:
        type: array
        value: $inputs.items
    outputs:
      documents:
        type: array

  - id: summarize
    type: llm
    model: haiku
    description: Summarize each document
    each: $steps.fetch.output.documents
    prompt: |
      Summarize this document in one sentence:
      $item.content
    inputs:
      document:
        type: object
        value: $item
    outputs:
      summary:
        type: string
        value: $result
```
