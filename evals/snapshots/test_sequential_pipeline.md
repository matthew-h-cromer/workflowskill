---
type: workflow
name: scrape-and-summarize
description: Scrapes a URL for headings and article text, then summarizes the content using an LLM.
actions: [web.scrape, anthropic.llm]
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

Fetches a webpage, extracts all `h1` headings and `p` article paragraphs via a
CSS selector, then passes the combined text to an Anthropic LLM to produce a
concise summary.

**Prerequisites:**
- `WELDABLE_API_KEY` must be set in your environment.
- The `anthropic` integration must be connected at weldable.ai (requires an
  Anthropic API key linked via OAuth or API key integration).

**Known limitations:**
- Very long pages may be truncated by the LLM's `max_tokens` budget. Increase
  `max_tokens` in the workflow if you need longer summaries.
- JavaScript-rendered content may not be captured by `web.scrape`.

## Workflow

```python
# Scrape h1 headings and article paragraphs from the URL
scraped = await workflow.execute_activity(
    "web.scrape",
    {"url": url, "selector": "h1, p"},
)

raw_text = scraped.get("text") or scraped.get("content") or scraped.get("body") or ""

if not raw_text.strip():
    return {"summary": "No content could be extracted from the provided URL."}

# Summarize the extracted content with an LLM
summary_result = await workflow.execute_activity(
    "anthropic.llm",
    {
        "prompt": f"""You are a helpful assistant. Read the following webpage content and write a clear, concise summary in 3–5 sentences. Focus on the main topic, key points, and any important conclusions.\n\nContent:\n{raw_text[:12000]}""",
        "max_tokens": 512,
    },
    start_to_close_timeout=timedelta(seconds=60),
)

summary = (
    summary_result.get("text")
    or summary_result.get("content")
    or summary_result.get("output")
    or ""
)

return {"summary": summary}
```
