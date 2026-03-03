---
name: llm-haiku
description: Generates a haiku on any subject using Claude Haiku. Requires ANTHROPIC_API_KEY.
---

# LLM Haiku

Generates a traditional 5-7-5 haiku on a given subject using the Claude Haiku model.

```workflow
inputs:
  subject:
    type: string
    default: "the ocean at dawn"

outputs:
  haiku:
    type: string
    value: $steps.generate.output.haiku

steps:
  - id: generate
    type: tool
    tool: llm
    description: Generate a haiku using Claude Haiku
    inputs:
      prompt:
        type: string
        value: "Write a traditional haiku (5-7-5 syllables) about: ${inputs.subject}"
      model:
        type: string
        value: claude-haiku-4-5-20251001
      schema:
        type: object
        value:
          haiku: string
    outputs:
      haiku:
        type: string
        value: $result.haiku
```
