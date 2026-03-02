---
name: conditional-routing
description: Fetches data from an API, checks if the result count exceeds a threshold, and returns either a summary message or the full data
---

# Conditional Routing Workflow

```workflow
inputs:
  api_url:
    type: string
    default: "https://jsonplaceholder.typicode.com/posts"
  threshold:
    type: int
    default: 10

outputs:
  message:
    type: string
    value: $steps.return_summary.output.message
  data:
    type: array
    value: $steps.return_full.output.data

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
        value: $inputs.api_url
      method:
        type: string
        value: "GET"
    outputs:
      items:
        type: array
        value: $result.body

  - id: route
    type: conditional
    condition: $steps.fetch_data.output.items.length > $inputs.threshold
    then:
      - return_summary
    else:
      - return_full
    inputs: {}
    outputs: {}

  - id: return_summary
    type: exit
    status: success
    output:
      message: "Result count exceeds threshold"
      data: []

  - id: return_full
    type: exit
    status: success
    output:
      message: ""
      data: $steps.fetch_data.output.items
```
