---
type: workflow
name: approval-gate
description: Submits a request to an API, then waits for human approval before returning the outcome.
inputs:
  request:
    type: str
outputs:
  status:
    type: str
    description: "The outcome of the approval gate: 'approved' or 'rejected'"
---

# Approval Gate

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Submit the request to the API
submission = await workflow.execute_activity(
    "api",
    {
        "url": "https://example.com/api/submit",
        "method": "POST",
        "body": request,
    },
)

# Pause until a human sends an 'approval' signal
approval = await workflow.wait_for_signal(
    "approval",
    prompt="Send an 'approval' signal with {\"approved\": true} to approve, or {\"approved\": false} to reject.",
)

# Route based on the approval decision
if approval and approval.get("approved") is True:
    return {"status": "approved"}
return {"status": "rejected"}
```
