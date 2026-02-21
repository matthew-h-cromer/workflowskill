---
name: retry-backoff
description: Tool fails twice then succeeds on third attempt with retry policy.
---

# Retry Backoff

```workflow
inputs: {}
outputs:
  result:
    type: object
steps:
  - id: flaky_call
    type: tool
    tool: flaky_api
    description: Flaky API that needs retries
    retry:
      max: 3
      delay: "100ms"
      backoff: 2.0
    inputs: {}
    outputs:
      data:
        type: object
```
