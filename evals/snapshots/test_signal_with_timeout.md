---
type: workflow
name: timed-approval
description: Waits for a human approval signal with a 1-hour timeout, returning approved, rejected, or timed_out.
inputs:
  request:
    type: str
    default: ""
outputs:
  status:
    type: str
    description: "The outcome: approved, rejected, or timed_out"
---

# Timed Approval

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Wait up to 1 hour for a human approval signal
try:
    approval = await workflow.wait_for_signal(
        "approval",
        prompt=f"Approve or reject the following request: {request}",
        timeout=3600,
    )
except asyncio.TimeoutError:
    return {"status": "timed_out"}

# Evaluate the approval response
if approval and approval.get("approved"):
    return {"status": "approved"}
return {"status": "rejected"}
```
