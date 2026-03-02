---
name: fetch-url-paragraphs
description: Fetches a web page URL and extracts all paragraph text from it.
---

# Fetch URL Paragraphs

```workflow
inputs:
  url:
    type: string
    default: "https://example.com"

outputs:
  paragraphs:
    type: array
    value: $steps.scrape_page.output.paragraphs

steps:
  - id: scrape_page
    type: tool
    tool: web.scrape
    retry:
      max: 3
      delay: "2s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: $inputs.url
      selector:
        type: string
        value: "p"
    outputs:
      paragraphs:
        type: array
        value: $result.results
```
