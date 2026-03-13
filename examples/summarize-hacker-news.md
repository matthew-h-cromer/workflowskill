---
name: summarize-hacker-news
description: Scrapes the Hacker News homepage and returns a concise summary of the top stories. Requires ANTHROPIC_API_KEY.
outputs:
  summary:
    type: str
---

# Summarize Hacker News

Scrapes story titles from https://news.ycombinator.com using CSS selectors and uses
Claude Haiku to produce a concise, readable summary of the top stories.

```python
# Scrape story titles from the Hacker News front page
page = await workflow.execute_activity(
    "scrape",
    {
        "url": "https://news.ycombinator.com",
        "selectors": {
            "titles": ".titleline > a",
            "scores": ".score",
        },
    },
    retry_policy=RetryPolicy(maximum_attempts=3),
)

# Build a compact list of stories to feed the LLM (deterministic Python)
titles = page["results"].get("titles", [])
scores = page["results"].get("scores", [])
stories_parts = []
for i, title in enumerate(titles):
    if i < len(scores):
        stories_parts.append(f"- {title} ({scores[i]})")
    else:
        stories_parts.append(f"- {title}")
stories = "\n".join(stories_parts)

# Summarize with Claude Haiku
summary = await workflow.execute_activity(
    "llm",
    {
        "model": "claude-haiku-4-5-20251001",
        "system": """You are a concise tech news summarizer. Return a brief, readable summary of the top Hacker News stories — what's trending and why it matters. Plain prose, no bullet lists, 3–5 sentences max.""",
        "prompt": f"Here are the top Hacker News stories:\n\n{stories}",
        "schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": summary["summary"]}
```
