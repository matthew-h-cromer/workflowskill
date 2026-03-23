---
type: workflow
name: extract-info
description: Extracts a title and summary from the provided text using an LLM.
actions: [llm]
inputs:
  text:
    type: str
    description: "The text to extract information from"
outputs:
  title:
    type: str
    description: "The extracted title"
  summary:
    type: str
    description: "The extracted summary"
---

# Extract Info

## Usage

Run this workflow using the run_workflow tool

## Details

Sends the provided text to an LLM and returns a structured result containing a
`title` and `summary`. Requires the `ANTHROPIC_API_KEY` environment variable to
be set.

## Workflow

```python
# Extract title and summary from the input text
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Extract a concise title and summary from the following text:\n\n{text}",
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
