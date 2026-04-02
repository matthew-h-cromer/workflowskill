---
type: workflow
name: analyze-document
description: Analyzes a text document using the Anthropic LLM and returns the result.
actions: [anthropic.llm]
inputs:
  text:
    type: str
    description: "The document text to analyze"
outputs:
  analysis:
    type: str
    description: "The LLM's analysis of the document"
---

# Analyze Document

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Analyze the provided document text with the LLM
result = await workflow.execute_activity(
    "anthropic.llm",
    {"prompt": f"Analyze the following document and provide a thorough analysis:\n\n{text}"},
    start_to_close_timeout=timedelta(seconds=120),
)

return {"analysis": result["output"]}
```
