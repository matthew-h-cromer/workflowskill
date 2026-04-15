---
version: 1
name: hello-world
description: "Returns a personalized greeting — the simplest possible workflow."
inputs:
  name:
    type: string
    default: World
    description: "The name to greet"
outputs:
  greeting: "{{ steps.greet.output }}"
steps:
  - id: greet
    description: Build the personalized greeting string
    type: transform
    expr: "'Hello, ' & input.name & '!'"
---

The minimal WorkflowSkill example. Takes a name and returns a greeting string.
No actions, no external calls — pure data transformation.

Demonstrates:
- Workflow structure and frontmatter
- `transform` step with a JSONata expression
- Top-level `outputs:` section
- Default input values
- Step `description` field for human-readable step labels
