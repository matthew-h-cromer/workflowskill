---
type: workflow
name: scrape-and-summarize
description: Scrapes a URL for headings and article paragraphs, then summarizes the content using an LLM.
inputs:
  url:
    type: str
outputs:
  summary:
    type: str
    description: "A concise summary of the scraped page content"
---

# Scrape and Summarize

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape headings and article paragraphs from the URL
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

# Build a focused text block from scraped content
headings = page["results"].get("headings", [])
paragraphs = page["results"].get("paragraphs", [])
content = "\n".join(headings) + "\n\n" + "\n".join(paragraphs)

# Summarize the extracted content with the LLM
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Summarize the following web page content concisely:\n\n{content}",
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
