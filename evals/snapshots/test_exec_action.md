---
type: workflow
name: disk-usage
description: Reports disk usage for a given path using du -sh.
inputs:
  path:
    type: str
    default: "."
outputs:
  status:
    type: str
    description: "ok or error"
  usage:
    type: str
    description: "Disk usage output (present when status is ok)"
  output:
    type: str
    description: "Raw command output (present when status is error)"
---

# Disk Usage

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Run du -sh on the given path
result = await workflow.execute_activity(
    "exec",
    {"command": f"du -sh {path}"},
)

if result["exit_code"] != 0:
    return {"status": "error", "output": result["output"]}

return {"status": "ok", "usage": result["output"]}
```
