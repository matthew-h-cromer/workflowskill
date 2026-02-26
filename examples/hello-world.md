---
name: hello-world
description: Returns "Hello, world!". No API keys or external services required.
---

# Hello World

The simplest possible workflow. Run it immediately after `npm install && npm run build`:

```sh
workflowskill run examples/hello-world.md
```

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
