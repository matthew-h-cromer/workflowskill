---
name: fetch-page
description: Fetches a URL and returns its content as markdown.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  content:
    type: str
    description: "Page content as markdown"
  url:
    type: str
    description: "Final URL after redirects"
---

# Fetch Page

Fetches the given URL using the web_fetch action and returns the page content as markdown.

```python
result = await workflow.execute_activity(
    "web_fetch",
    {"url": url, "extract": "markdown"},
)
return {"content": result["content"], "url": result["url"]}
```