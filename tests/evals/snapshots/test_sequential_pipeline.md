---
name: fetch-and-summarize
description: Fetches a URL and returns an LLM-generated summary of its content.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  summary:
    type: str
    description: "A concise summary of the page content."
---

# Fetch and Summarize

Fetches the content of a URL and uses an LLM to produce a concise summary.
The two steps run sequentially: the page must be retrieved before summarization begins.

```python
page = await workflow.execute_activity(
    "web_fetch",
    {"url": url, "extract": "text"},
)

summary = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Summarize the following web page content in 2-3 concise sentences:\n\n{page['content']}",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
            },
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": summary["summary"]}
```