---
name: web-fetch-hacker-news
description: Fetches the Hacker News homepage and returns a concise, readable summary of the top stories.
---

# Web Fetch: Hacker News

Fetches https://news.ycombinator.com and uses Claude Haiku to produce a concise, readable summary of the top stories.

```sh
workflowskill run examples/web-fetch-hacker-news.md
```

```workflow
outputs:
  summary:
    type: string
    value: $steps.summarize.output.summary

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

  - id: summarize
    type: tool
    tool: llm
    description: Summarize the top Hacker News stories
    inputs:
      model:
        type: string
        value: "claude-haiku-4-5-20251001"
      system:
        type: string
        value: "You are a concise tech news summarizer. Return a brief, readable summary of the top Hacker News stories — what's trending and why it matters. Plain prose, no bullet lists, 3–5 sentences max."
      prompt:
        type: string
        value: "Here is the Hacker News front page:\n\n{{ steps.fetch.output.content }}"
      schema:
        type: object
        value:
          type: object
          properties:
            summary:
              type: string
          required:
            - summary
    outputs:
      summary:
        type: string
        value: $result.summary
```
