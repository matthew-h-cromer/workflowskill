---
name: each-tool-dynamic-url
description: Tool step with each iteration that constructs dynamic URLs using the + operator.
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
    tool: http.request
    description: Fetch details for each item
    each: $steps.get_ids.output.ids
    inputs:
      url:
        type: string
        value: $inputs.base_url + $item + ".json"
    outputs:
      title:
        type: string
        value: $result.body.title
      id:
        type: int
        value: $result.body.id
```
