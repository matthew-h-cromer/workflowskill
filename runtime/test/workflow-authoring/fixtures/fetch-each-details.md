---
name: fetch-each-details
description: Accepts a list of IDs, fetches details for each from a configurable API endpoint, and returns all the details
---

# Fetch Details for Each ID

```workflow
inputs:
  ids:
    type: array
  base_url:
    type: string
    default: "https://api.example.com/items/"

outputs:
  details:
    type: array
    value: $steps.fetch_details.output

steps:
  - id: fetch_details
    type: tool
    tool: http.request
    description: Fetch details for each ID from the API endpoint
    each: $inputs.ids
    on_error: ignore
    retry:
      max: 3
      delay: "1s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: "${inputs.base_url}${item}"
      method:
        type: string
        value: "GET"
    outputs:
      detail:
        type: object
        value: $result.body
```
