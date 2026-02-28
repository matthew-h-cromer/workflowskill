---
name: hello-world-gmail
description: Sends a 'Hello World' email to a provided email address
---

# Hello World Email

```workflow
inputs:
  to:
    type: string

outputs:
  message_id:
    type: string
    value: $steps.send_email.output.message_id

steps:
  - id: send_email
    type: tool
    tool: gmail.send
    description: Send a hello world email to the provided address
    inputs:
      to:
        type: string
        value: $inputs.to
      subject:
        type: string
        value: "Hello World"
      body:
        type: string
        value: "Hello, World!"
    outputs:
      message_id:
        type: string
        value: $result.message_id
```
