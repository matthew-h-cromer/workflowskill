---
name: extract-info
description: Extracts a title and summary from the provided text using structured LLM output.
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

Sends the provided text to the LLM and returns a structured response containing a title and summary.

```python
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Analyze the following text and extract a title and summary:\n\n{text}",
        "schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "A short title capturing the main topic of the text",
                },
                "summary": {
                    "type": "string",
                    "description": "A concise summary of the text",
                },
            },
            "required": ["title", "summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"title": result["title"], "summary": result["summary"]}
```