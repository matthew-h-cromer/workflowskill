---
name: tier1-fetch-url
description: Fetches a URL and returns the response body.
---

# Fetch URL

```workflow
inputs:
  url:
    type: string
    default: "https://example.com"

outputs:
  body:
    type: string
    value: $steps.fetch.output.body

steps:
  - id: fetch
    type: tool
    tool: http.request
    retry:
      max: 3
      delay: "2s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: $inputs.url
      method:
        type: string
        value: "GET"
    outputs:
      body:
        type: string
        value: $result.body
```
