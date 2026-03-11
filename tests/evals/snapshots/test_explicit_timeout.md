---
name: analyze-document
description: Analyzes a document using an LLM and returns the result.
inputs:
  text:
    type: str
    default: ""
outputs:
  analysis:
    type: str
    description: "The analysis produced by the LLM"
---

# Analyze Document

Sends the provided text to the LLM for analysis and returns the result.

```python
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Analyze the following document and provide a thorough analysis:\n\n{text}",
        "schema": {
            "type": "object",
            "properties": {
                "analysis": {"type": "string"}
            },
            "required": ["analysis"],
        },
    },
    start_to_close_timeout=timedelta(seconds=120),
)

return {"analysis": result["analysis"]}
```