---
version: 1
name: try-catch
description: Catch an error from an action and produce a fallback value
steps:
  - id: handled
    description: Attempt the action and catch any error with a fallback
    type: try
    body:
      - id: attempt
        description: Call the action that will throw
        type: action
        uses: "test.will_throw"
    catch:
      - id: result
        description: Return caught as the fallback value
        type: transform
        expr: "'caught'"
outputs:
  result: "{{ steps.result.output }}"
---

Try an action that throws and catch the error to produce a fallback value.
