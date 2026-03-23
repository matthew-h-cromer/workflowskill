---
type: workflow
name: disk-usage
description: Report disk usage for a given path using du -sh.
actions: [exec]
inputs:
  path:
    type: str
    default: "."
    description: "Path to check disk usage for"
outputs:
  status:
    type: str
    description: "'ok' on success, 'error' on failure"
  usage:
    type: str
    description: "Disk usage string from du -sh (present on success)"
  output:
    type: str
    description: "Raw command output (present on error)"
---

# Disk Usage

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Run du -sh on the specified path
result = await workflow.execute_activity(
    "exec",
    {"command": f"du -sh {path}"},
)

# Return error details if the command failed
if result["exit_code"] != 0:
    return {"status": "error", "output": result["output"]}

return {"status": "ok", "usage": result["output"]}
```
