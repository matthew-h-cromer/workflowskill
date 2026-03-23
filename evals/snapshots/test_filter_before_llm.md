---
type: workflow
name: blog-themes
description: Scrapes blog post titles and dates, filters to 2025 posts, and summarizes their themes using an LLM.
actions: [scrape, llm]
inputs:
  url:
    type: str
    description: "URL of the blog to analyze"
outputs:
  summary:
    type: str
    description: "LLM-generated summary of themes from 2025 blog posts"
---

# Blog Themes

## Usage

Run this workflow using the run_workflow tool

## Details

Scrapes a blog's post titles and dates using CSS selectors, filters to only posts from 2025, then asks Claude to summarize the recurring themes. Requires the blog to use `.post-title` and `.post-date` CSS classes. If no 2025 posts are found, the workflow exits early with a descriptive message.

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

# Filter to posts from 2025 using pure Python
posts_2025 = [
    {"title": title, "date": date}
    for title, date in zip(titles, dates)
    if "2025" in date
]

if not posts_2025:
    return {"summary": "No posts from 2025 were found on this blog."}

# Format titles for the LLM prompt
post_list = "\n".join(
    f"- {p['title']} ({p['date']})" for p in posts_2025
)

# Summarize the themes of the 2025 posts
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Here are blog post titles from 2025:\n\n{post_list}\n\nSummarize the main themes covered across these posts.",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"}
            },
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": result["summary"]}
```
