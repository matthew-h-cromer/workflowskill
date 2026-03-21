---
type: workflow
name: blog-themes
description: Scrapes blog post titles and dates, filters to 2025 posts, and summarizes their themes using an LLM.
inputs:
  url:
    type: str
outputs:
  summary:
    type: str
    description: "A summary of the themes found across 2025 blog posts"
---

# Blog Themes

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape post titles and dates from the blog
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "titles": ".post-title",
            "dates": ".post-date",
        },
    },
)

titles = page["results"].get("titles", [])
dates = page["results"].get("dates", [])

# Pair titles with dates, keep only 2025 posts
posts_2025 = [
    title
    for title, date in zip(titles, dates)
    if "2025" in date
]

if not posts_2025:
    return {"summary": "No posts from 2025 were found on this page."}

# Format titles as a numbered list for the LLM
post_list = "\n".join(f"{i + 1}. {title}" for i, title in enumerate(posts_2025))

# Summarize the themes across 2025 posts
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"""The following are blog post titles from 2025. Summarize the main themes they cover in 2-3 sentences.

{post_list}""",
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
