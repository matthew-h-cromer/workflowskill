---
name: output-source
description: Tests step output source mapping with $result and workflow output source with $steps.
---

# Output Source Test

```workflow
inputs:
  url:
    type: string
    default: "https://example.com/articles"

outputs:
  title:
    type: string
    value: $steps.fetch.output.title
  author:
    type: string
    value: $steps.fetch.output.author

steps:
  - id: fetch
    type: tool
    tool: web.scrape
    inputs:
      url:
        type: string
        value: $inputs.url
      selector:
        type: string
        value: "article.post"
      fields:
        type: object
        value:
          title: "h1"
          author: "span.author"
    outputs:
      title:
        type: string
        value: $result.results[0].title
      author:
        type: string
        value: $result.results[0].author
```
