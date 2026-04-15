---
version: 1
name: greeting-formatter
description: "Returns a personalized greeting by combining a first and last name into a friendly Hello message."
inputs:
  first_name:
    type: string
    description: "The person's first name"
  last_name:
    type: string
    description: "The person's last name"
outputs:
  greeting: "{{ steps.greet.output }}"
steps:
  - id: greet
    description: Build the Hello greeting from first and last name
    type: transform
    expr: "'Hello, ' & input.first_name & ' ' & input.last_name & '!'"
---

Combines a first name and last name into a friendly greeting of the form `Hello, FirstName LastName!` using a pure JSONata string transformation — no external actions or API calls required.
