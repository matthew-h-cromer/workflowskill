---
name: llm-judgment
description: Tool step followed by scoring tool step.
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
    type: tool
    tool: score_email
    description: Score email priority
    inputs:
      messages:
        type: array
        value: $steps.fetch_emails.output.messages
    outputs:
      scored:
        type: array
        value: $result
```
