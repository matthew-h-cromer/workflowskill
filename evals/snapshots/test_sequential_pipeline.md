---
type: workflow
name: scrape-and-summarize
description: Scrapes a URL for headings and article text, then summarizes the content using an LLM.
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

headings = page["results"].get("headings", [])
paragraphs = page["results"].get("paragraphs", [])

# Bail early if nothing useful was extracted
if not headings and not paragraphs:
    return {"summary": "No content could be extracted from the provided URL."}

# Build a compact content block for the LLM
heading_text = "\n".join(headings)
paragraph_text = "\n\n".join(paragraphs)
content = f"# {heading_text}\n\n{paragraph_text}".strip()

# Summarize the extracted content
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
