---
name: malformed-bad-yaml
description: Invalid YAML in workflow block.
---

# Bad YAML

```workflow
steps:
  - id: broken
    type: tool
    tool: [invalid yaml structure
    inputs: {
```
