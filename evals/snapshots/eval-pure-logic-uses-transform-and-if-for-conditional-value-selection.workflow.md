---
version: 1
name: score-to-grade
description: "Converts a numeric score into a letter grade: A for 90+, B for 80–89, and C for anything below 80."
inputs:
  score:
    type: number
    description: "The numeric score to convert into a letter grade"
outputs:
  grade: "{{ steps.grade.output }}"
steps:
  - id: grade
    description: Depending on the score, assign letter grade A, B, or C
    type: switch
    on: "input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : 'C'"
    cases:
      A:
        - id: grade_a
          description: Return grade A for scores 90 and above
          type: transform
          expr: "'A'"
      B:
        - id: grade_b
          description: Return grade B for scores 80 to 89
          type: transform
          expr: "'B'"
    default:
      - id: grade_c
        description: Return grade C for scores below 80
        type: transform
        expr: "'C'"
---

Converts a numeric input score into a letter grade using pure conditional logic with no external calls.

- **A** — score is 90 or above
- **B** — score is 80 through 89
- **C** — score is below 80

The workflow uses a `switch` step that evaluates the score with a JSONata ternary expression, routes to the matching case, and returns the grade string.
