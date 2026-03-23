---
type: workflow
name: scrape-and-summarize
description: Scrapes a URL for headings and article text, then summarizes the content using an LLM.
actions: [scrape, llm]
inputs:
  url:
    type: str
    description: "The URL of the page to scrape and summarize"
outputs:
  summary:
    type: str
    description: "A concise summary of the scraped page content"
---

# Scrape and Summarize

## Usage

Run this workflow using the run_workflow tool

## Details

Fetches a web page and extracts its `h1` headings and `article p` paragraphs using CSS selectors, then passes the extracted text to Claude for summarization. Works best on article or blog pages with semantic HTML. Pages that load content via JavaScript or require authentication may return little or no text.

**Prerequisites:** `ANTHROPIC_API_KEY` must be set in the environment.

## Workflow

```python
# Scrape headings and article paragraphs from the page
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
    return {"summary": "No extractable content found at the provided URL."}

# Assemble content for the LLM
heading_text = "\n".join(headings)
body_text = "\n\n".join(paragraphs)
content = f"# {heading_text}\n\n{body_text}".strip()

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
