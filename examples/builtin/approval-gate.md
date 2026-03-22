---
type: workflow
name: approval-gate
description: "Pause and wait for human approval before returning the outcome."
outputs:
  status:
    type: str
    description: "approved or rejected"
---

# Approval Gate

Demonstrates human-in-the-loop: pauses for a human to approve or reject, then returns the outcome.

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
approval = await workflow.wait_for_signal(
    "approval",
    prompt="Approve? (yes/no):",
)

if approval and approval.strip().lower() in ("yes", "y"):
    return {"status": "approved"}
return {"status": "rejected"}
```
