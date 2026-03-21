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
    description: "A summary of the themes found in 2025 blog posts"
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

# Filter to only posts from 2025
posts_2025 = [
    title
    for title, date in zip(titles, dates)
    if "2025" in date
]

if not posts_2025:
    return {"summary": "No blog posts from 2025 were found."}

# Format titles for the LLM prompt
post_list = "\n".join(f"- {title}" for title in posts_2025)

# Summarize the themes of the 2025 posts
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Here are blog post titles from 2025:\n\n{post_list}\n\nWhat are the main themes across these posts? Provide a concise summary.",
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
