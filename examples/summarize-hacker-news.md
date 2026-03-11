---
name: summarize-hacker-news
description: Fetches the Hacker News homepage and returns a concise summary of the top stories. Requires ANTHROPIC_API_KEY.
outputs:
  summary:
    type: str
---

# Summarize Hacker News

Fetches https://news.ycombinator.com and uses Claude Haiku to produce a concise,
readable summary of the top stories.

```python
# Fetch the Hacker News front page as plain text
page = await workflow.execute_activity(
    "web_fetch",
    {"url": "https://news.ycombinator.com", "extract": "text"},
    retry_policy=RetryPolicy(maximum_attempts=3),
)

# Summarize with Claude Haiku
summary = await workflow.execute_activity(
    "llm",
    {
        "model": "claude-haiku-4-5-20251001",
        "system": (
            "You are a concise tech news summarizer. Return a brief, readable summary "
            "of the top Hacker News stories — what's trending and why it matters. "
            "Plain prose, no bullet lists, 3–5 sentences max."
        ),
        "prompt": f"Here is the Hacker News front page:\n\n{page['content']}",
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
