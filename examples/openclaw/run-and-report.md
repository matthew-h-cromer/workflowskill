---
type: workflow
name: run-and-report
description: Run a shell command and return a structured report of its output.
inputs:
  command:
    type: str
    default: "git log --oneline -10"
  workdir:
    type: str
    default: "."
outputs:
  output:
    type: str
    description: "Raw command output"
  summary:
    type: str
    description: "Plain-language summary of what the output shows"
  exit_code:
    type: int
    description: "Command exit code (0 = success)"
---

# Run and Report

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Execute the shell command
result = await workflow.execute_activity(
    "exec",
    {"command": command, "workdir": workdir, "timeout": 60},
    start_to_close_timeout=timedelta(seconds=90),
)

output = result["output"]
exit_code = result["exit_code"]

if not output.strip():
    return {
        "output": output,
        "summary": "The command produced no output.",
        "exit_code": exit_code,
    }

# Summarize what the output means
report = await workflow.execute_activity(
    "llm_task",
    {
        "prompt": f"Summarize what this command output shows in 1-2 sentences. Command: {command}",
        "input": output[:3000],
        "schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=30),
)

return {
    "output": output,
    "summary": report["summary"],
    "exit_code": exit_code,
}
```
