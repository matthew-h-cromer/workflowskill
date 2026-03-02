---
name: llm-summarize
description: Accepts a text input, summarizes it with an LLM, and returns the summary
---

# LLM Summarize

```workflow
inputs:
  text:
    type: string

outputs:
  summary:
    type: string
    value: $steps.summarize.output.summary

steps:
  - id: summarize
    type: llm
    model: haiku
    prompt: |
      Summarize the following text concisely in a few sentences.

      Text: $inputs.text

      Respond with plain text only — no markdown, no commentary, just the summary.
    inputs:
      text:
        type: string
        value: $inputs.text
    outputs:
      summary:
        type: string
        value: $result
```
