---
name: fetch-and-filter-active
description: Fetches a JSON API that returns a list of items and filters to keep only items where status is "active"
---

# Fetch and Filter Active Items

```workflow
inputs:
  api_url:
    type: string
    default: "https://jsonplaceholder.typicode.com/todos"

outputs:
  active_items:
    type: array
    value: $steps.filter_active.output.items

steps:
  - id: fetch_items
    type: tool
    tool: http.request
    retry:
      max: 3
      delay: "1s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: $inputs.api_url
      method:
        type: string
        value: "GET"
    outputs:
      items:
        type: array
        value: $result.body

  - id: filter_active
    type: transform
    operation: filter
    where: $item.status == "active"
    inputs:
      items:
        type: array
        value: $steps.fetch_items.output.items
    outputs:
      items:
        type: array
```
