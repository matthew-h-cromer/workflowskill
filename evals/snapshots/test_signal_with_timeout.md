---
type: workflow
name: timed-approval
description: Submits a request for human approval and waits up to 1 hour for a response.
inputs:
  request:
    type: str
    description: "The request to submit for human approval"
outputs:
  status:
    type: str
    description: "Outcome of the approval: 'approved', 'rejected', or 'timed_out'"
---

# Timed Approval

## Usage

Run this workflow using the run_workflow tool

## Details

Pauses execution and waits for a human to send an `approval` signal within 1 hour.
The signal payload should be a JSON object with an `"approved"` boolean key, e.g.
`{"approved": true}` or `{"approved": false, "reason": "..."}`.

If no signal is received within 1 hour, the workflow returns `timed_out`.

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
