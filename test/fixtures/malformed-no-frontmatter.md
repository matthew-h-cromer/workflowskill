# No Frontmatter

```workflow
steps:
  - id: echo
    type: transform
    operation: map
    inputs:
      data:
        type: string
    outputs:
      mapped:
        type: string
    expression:
      value: $item
```
