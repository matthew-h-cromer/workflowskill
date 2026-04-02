---
type: workflow
name: blog-themes
description: Scrapes blog post titles and dates from a URL, filters to 2025 posts, and uses an LLM to summarize their themes.
actions: [web.scrape, anthropic.llm]
inputs:
  url:
    type: str
    description: "URL of the blog to analyze"
outputs:
  summary:
    type: str
    description: "LLM-generated summary of themes across 2025 blog posts"
---

# Blog Themes

## Usage

Run this workflow using the run_workflow tool

## Details

Scrapes a blog page for post titles and dates, filters down to posts from 2025,
then asks an LLM to identify and summarize the recurring themes.

**Prerequisites:**
- The target blog must expose post titles via `.post-title` and dates via `.post-date` CSS selectors.
- `WELDABLE_API_KEY` must be set in your environment.
- The `anthropic` integration must be connected at weldable.ai.

**Known limitations:**
- Only posts visible on the scraped page are analyzed (no pagination).
- Date filtering is string-based: a post is included if `"2025"` appears anywhere in its `.post-date` text.

## Workflow

```python
# Scrape post titles and dates in parallel
titles_result, dates_result = await asyncio.gather(
    workflow.execute_activity("web.scrape", {"url": url, "selector": ".post-title"}),
    workflow.execute_activity("web.scrape", {"url": url, "selector": ".post-date"}),
)

titles = titles_result.get("results", [])
dates = dates_result.get("results", [])

# Pair titles with dates and filter to 2025 posts
posts_2025 = [
    title
    for title, date in zip(titles, dates)
    if "2025" in str(date)
]

if not posts_2025:
    return {"summary": "No posts from 2025 were found on the page."}

# Build a prompt from the filtered titles
titles_list = "\n".join(f"- {t}" for t in posts_2025)

# Summarize themes with the LLM
llm_result = await workflow.execute_activity(
    "anthropic.llm",
    {
        "prompt": f"Here are blog post titles from 2025:\n\n{titles_list}\n\nIdentify and summarize the main themes across these posts in 2–3 sentences.",
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": llm_result["result"]}
```
