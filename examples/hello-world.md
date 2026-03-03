---
name: hello-world
description: Returns "Hello, world!". No API keys or external services required.
---

# Hello World

The simplest possible workflow.

```workflow
outputs:
  message:
    type: string

steps:
  - id: greet
    type: exit
    status: success
    output:
      message: "Hello, world!"
```
