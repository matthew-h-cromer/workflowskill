---
name: scrape-and-summarize
description: Scrapes a webpage for its main headings and article content, then returns an AI-generated summary.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  summary:
    type: str
    description: "A concise summary of the scraped page content"
---

# Scrape and Summarize

Fetches the main headings and article paragraphs from a webpage, then summarizes the content.

```python
# Scrape headings and article content
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "headings": "h1",
            "paragraphs": "article p",
        },
    },
)

headings = page["results"].get("headings", [])
paragraphs = page["results"].get("paragraphs", [])
content = "\n".join(headings + paragraphs)

if not content.strip():
    return {"summary": "No content could be extracted from the provided URL."}

# Summarize the extracted content
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"""Summarize the following webpage content in 2-3 concise sentences.

{content}""",
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

return {"summary": result["summary"]}
```
