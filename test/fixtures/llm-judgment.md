---
name: llm-judgment
description: Tool step followed by LLM step for scoring.
---

# LLM Judgment

```workflow
inputs:
  account:
    type: string
outputs:
  scored:
    type: array
steps:
  - id: fetch_emails
    type: tool
    tool: gmail_fetch
    description: Fetch recent emails
    inputs:
      account:
        type: string
        value: $inputs.account
    outputs:
      messages:
        type: array

  - id: score
    type: llm
    model: haiku
    description: Score email priority
    prompt: |
      Score the priority of this email from 1-10.
      Subject: $steps.fetch_emails.output.messages
      Return JSON: { "score": <int>, "summary": "<one line>" }
    inputs:
      messages:
        type: array
        value: $steps.fetch_emails.output.messages
    outputs:
      scored:
        type: array
```
