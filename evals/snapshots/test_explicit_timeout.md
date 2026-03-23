---
type: workflow
name: analyze-document
description: Analyzes a text document using an LLM and returns the analysis.
actions: [llm]
inputs:
  text:
    type: str
    description: "The document text to analyze"
outputs:
  analysis:
    type: str
    description: "The analysis produced by the LLM"
---

# Analyze Document

## Usage

Run this workflow using the run_workflow tool

## Details

Sends a document to the LLM for analysis and returns the result. The LLM call
is given up to 120 seconds to complete, which accommodates longer documents
that may require more processing time.

Prerequisites: `ANTHROPIC_API_KEY` environment variable must be set.

## Workflow

```python
# Analyze the document with the LLM
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
