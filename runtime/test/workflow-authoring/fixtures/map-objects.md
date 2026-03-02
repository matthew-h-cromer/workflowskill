---
name: map-user-objects
description: Accepts a list of user objects, maps each to extract only name and email fields, and returns the mapped list
---

# Map User Objects

```workflow
inputs:
  users:
    type: array

outputs:
  mapped_users:
    type: array
    value: $steps.extract_fields.output.items

steps:
  - id: extract_fields
    type: transform
    operation: map
    expression:
      name: $item.name
      email: $item.email
    inputs:
      items:
        type: array
        value: $inputs.users
    outputs:
      items:
        type: array
```
