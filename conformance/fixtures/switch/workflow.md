---
version: 1
name: switch
description: Switch on a string value to select a label
inputs:
  status:
    type: string
steps:
  - id: router
    description: Depending on status, route to the matching label
    type: switch
    on: "input.status"
    cases:
      pending:
        - id: label
          description: Return Pending label
          type: transform
          expr: "'Pending'"
      done:
        - id: label
          description: Return Done label
          type: transform
          expr: "'Done'"
    default:
      - id: label
        description: Return Unknown label for unrecognized statuses
        type: transform
        expr: "'Unknown'"
outputs:
  label: "{{ steps.label.output }}"
---

Select a display label based on a status string using a multi-way branch.
