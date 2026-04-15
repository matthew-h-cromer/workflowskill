---
version: 1
name: score-to-grade
description: "Converts a numeric score into a letter grade: A for 90+, B for 80–89, or C for anything below."
inputs:
  score:
    type: number
    description: "The numeric score to grade"
outputs:
  grade: "{{ steps.grade.output }}"
steps:
  - id: grade
    description: Depending on the score, assign letter grade A, B, or C
    type: switch
    on: "score >= 90 ? 'A' : score >= 80 ? 'B' : 'C'"
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

Converts a numeric input score into a letter grade using pure conditional logic — no external calls required.

- **A** — score is 90 or above
- **B** — score is 80 through 89
- **C** — score is below 80

The result is returned as `grade` in the workflow output.
