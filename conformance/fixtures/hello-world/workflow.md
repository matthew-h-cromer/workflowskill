---
version: 1
name: hello-world
description: Returns a greeting message
inputs:
  name:
    type: string
    default: World
outputs:
  greeting: "{{ steps.greet.output }}"
steps:
  - id: greet
    description: Build the greeting string
    type: transform
    expr: "'Hello, ' & input.name & '!'"
---

A minimal workflow that takes a name and returns a greeting string.
