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
        source: $inputs.items
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
        source: $item
    outputs:
      summary:
        type: string
```
