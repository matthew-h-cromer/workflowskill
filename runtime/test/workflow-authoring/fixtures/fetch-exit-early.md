---
name: fetch-exit-early
description: Fetches data from an API and exits early with an error status if the response is empty, otherwise returns the data
---

# Fetch with Early Exit on Empty Response

```workflow
inputs:
  url:
    type: string
    default: "https://jsonplaceholder.typicode.com/posts"

outputs:
  data:
    type: array
    value: $steps.fetch_data.output.data

steps:
  - id: fetch_data
    type: tool
    tool: http.request
    retry:
      max: 3
      delay: "1s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: $inputs.url
      method:
        type: string
        value: "GET"
    outputs:
      data:
        type: array
        value: $result.body

  - id: guard_empty
    type: exit
    condition: $steps.fetch_data.output.data.length == 0
    status: failed
    output:
      data: []
```
