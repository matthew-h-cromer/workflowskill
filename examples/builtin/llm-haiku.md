---
type: workflow
name: llm-haiku
description: Generates a haiku on any subject using Claude Haiku. Requires ANTHROPIC_API_KEY.
inputs:
  subject:
    type: str
    default: "the ocean at dawn"
outputs:
  haiku:
    type: str
---

# LLM Haiku

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
result = await workflow.execute_activity(
    "llm",
    {
        "model": "claude-haiku-4-5-20251001",
        "prompt": f"Write a traditional haiku (5-7-5 syllables) about: {subject}",
        "schema": {
            "type": "object",
            "properties": {"haiku": {"type": "string"}},
            "required": ["haiku"],
        },
    },
)
return {"haiku": result["haiku"]}
```
