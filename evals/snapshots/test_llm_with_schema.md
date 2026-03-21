---
type: workflow
name: extract-info
description: Extracts a title and summary from the provided text using structured LLM output.
inputs:
  text:
    type: str
    default: ""
outputs:
  title:
    type: str
    description: "A short title derived from the text"
  summary:
    type: str
    description: "A brief summary of the text"
---

# Extract Info

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract structured title and summary from the input text
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Read the following text and extract a short title and a brief summary.\n\nText:\n{text}",
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
            },
            "required": ["title", "summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"title": result["title"], "summary": result["summary"]}
```
