---
type: workflow
name: extract-info
description: Extracts a title and summary from input text using a structured LLM call.
actions: [anthropic.llm]
inputs:
  text:
    type: str
    description: "The text to extract information from"
outputs:
  title:
    type: str
    description: "Extracted title from the text"
  summary:
    type: str
    description: "Extracted summary from the text"
---

# Extract Info

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract structured title and summary from the input text
result = await workflow.execute_activity(
    "anthropic.llm",
    {
        "prompt": f"Extract a title and summary from the following text:\n\n{text}",
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
            },
            "required": ["title", "summary"],
        },
    },
)

return {"title": result["title"], "summary": result["summary"]}
```
