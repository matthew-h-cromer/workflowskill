---
version: 1
name: if-then-else
description: Conditional branch
inputs:
  count:
    type: number
outputs:
  label: "{{ steps.label.output }}"
steps:
  - id: branch
    description: If count is positive, label it; otherwise label as non-positive
    type: if
    when: "input.count > 0"
    then:
      - id: label
        description: Return positive label
        type: transform
        expr: "'positive'"
    else:
      - id: label
        description: Return non-positive label
        type: transform
        expr: "'non-positive'"
---

Branch on whether count is positive and return the appropriate label.
