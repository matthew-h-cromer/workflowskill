---
name: tier1-hello-world
description: Returns "Hello, world!" with no external dependencies.
---

# Hello World

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
    inputs: {}
    outputs: {}
```
