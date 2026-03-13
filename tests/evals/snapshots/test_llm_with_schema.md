---
name: extract-info
description: Extracts a title and summary from a given text using structured inference.
inputs:
  text:
    type: str
    default: ""
outputs:
  title:
    type: str
    description: "A short title capturing the main topic of the text"
  summary:
    type: str
    description: "A concise summary of the text"
---

# Extract Info

Reads a piece of text and pulls out a title and a summary.

```python
# Extract title and summary from text
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Read the following text and extract a short title and a concise summary.\n\nText:\n{text}",
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
