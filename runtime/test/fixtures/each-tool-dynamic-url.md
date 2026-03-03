---
name: each-tool-dynamic-url
description: Tool step with each iteration that constructs dynamic URLs using template interpolation.
---

# Each Tool Dynamic URL

```workflow
inputs:
  base_url:
    type: string
    default: "https://api.example.com/item/"

outputs:
  details:
    type: array
    value: $steps.fetch_details.output

steps:
  - id: get_ids
    type: tool
    tool: get_ids
    description: Fetch list of item IDs
    outputs:
      ids:
        type: array

  - id: fetch_details
    type: tool
    tool: web.scrape
    description: Fetch details for each item
    each: $steps.get_ids.output.ids
    inputs:
      url:
        type: string
        value: "${inputs.base_url}${item}.json"
      selector:
        type: string
        value: "div.item"
      fields:
        type: object
        value:
          title: "h1"
          id: "@data-id"
    outputs:
      title:
        type: string
        value: $result.results[0].title
      id:
        type: int
        value: $result.results[0].id
```
