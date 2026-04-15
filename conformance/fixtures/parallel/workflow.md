---
version: 1
name: parallel
description: Two parallel transforms in named branches
inputs:
  x:
    type: number
  y:
    type: number
steps:
  - id: compute
    description: In parallel, double x and triple y
    type: parallel
    branches:
      double:
        - id: res
          description: Multiply x by two
          type: transform
          expr: "input.x * 2"
      triple:
        - id: res
          description: Multiply y by three
          type: transform
          expr: "input.y * 3"
outputs:
  doubled: "{{ steps.compute.branches.double.res.output }}"
  tripled: "{{ steps.compute.branches.triple.res.output }}"
---

Concurrently compute double of x and triple of y in named branches.
