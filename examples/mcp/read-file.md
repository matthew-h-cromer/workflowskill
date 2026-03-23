---
name: read-file
type: workflow
description: Read a file using MCP filesystem server
inputs:
  path:
    type: str
    description: Path to file to read
outputs:
  content:
    type: str
    description: File contents
---

```python
result = await workflow.execute_activity("read_file", {"path": path})
return {"content": result["content"]}
```
