---
type: workflow
name: analyze-document
description: Analyzes a text document using an LLM and returns the analysis.
inputs:
  text:
    type: str
    default: ""
outputs:
  analysis:
    type: str
    description: "The LLM's analysis of the provided text"
---

# Analyze Document

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Analyze the provided text with the LLM
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Analyze the following document:\n\n{text}",
        "schema": {
            "type": "object",
            "properties": {"analysis": {"type": "string"}},
            "required": ["analysis"],
        },
    },
    start_to_close_timeout=timedelta(seconds=120),
)

return {"analysis": result["analysis"]}
```
