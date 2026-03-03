---
name: web-fetch-hacker-news
description: Fetches the Hacker News homepage and returns the front page as plain text.
---

# Web Fetch: Hacker News

Fetches https://news.ycombinator.com and extracts the front page content as plain text.

```sh
workflowskill run examples/web-fetch-hacker-news.md
```

```workflow
outputs:
  content:
    type: string
    value: $steps.fetch.output.content

steps:
  - id: fetch
    type: tool
    tool: web_fetch
    description: Fetch the Hacker News front page
    inputs:
      url:
        type: string
        value: "https://news.ycombinator.com"
      extract:
        type: string
        value: text
    outputs:
      content:
        type: string
        value: $result.content
```
