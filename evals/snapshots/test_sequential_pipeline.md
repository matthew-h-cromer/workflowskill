---
type: workflow
name: scrape-and-summarize
description: Scrapes a URL for headings and article content, then summarizes it.
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

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract headings and article paragraphs from the page
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

# Combine headings and paragraphs into a single block of text
headings = page["results"].get("headings", [])
paragraphs = page["results"].get("paragraphs", [])
content = "\n".join(headings + paragraphs)

if not content.strip():
    return {"summary": "No content could be extracted from the page."}

# Summarize the extracted content
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"""Summarize the following web page content in 2-3 sentences.

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
