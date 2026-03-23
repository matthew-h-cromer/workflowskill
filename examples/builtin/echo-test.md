---
type: workflow
name: echo-test
description: "Run a shell command and return its output."
inputs:
  command:
    type: str
    default: "echo hello from exec"
outputs:
  output:
    type: str
    description: "Command stdout/stderr"
  exit_code:
    type: int
    description: "Process exit code"
---

# Echo Test

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
result = await workflow.execute_activity(
    "exec",
    {"command": command},
    start_to_close_timeout=timedelta(seconds=30),
)
return {"output": result["output"], "exit_code": result["exit_code"]}
```
