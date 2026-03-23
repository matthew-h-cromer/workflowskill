---
type: workflow
name: timed-approval
description: Submits a request and waits up to 1 hour for a human approval signal.
inputs:
  request:
    type: str
    description: "The request to be approved or rejected"
outputs:
  status:
    type: str
    description: "Outcome of the approval: 'approved', 'rejected', or 'timed_out'"
---

# Timed Approval

## Usage

Run this workflow using the run_workflow tool

## Details

Pauses after receiving a request and waits for a human to send an `approval`
signal within 1 hour. The signal payload must be a JSON object with an
`"approved"` boolean field, e.g. `{"approved": true}` or `{"approved": false}`.

If no signal arrives within the timeout window, the workflow returns
`timed_out` without error. If a signal is received, the workflow returns
`approved` or `rejected` based on the payload.

**Signal name:** `approval`  
**Expected payload:** `{"approved": true}` or `{"approved": false}`  
**Timeout:** 1 hour

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

# Evaluate the approval payload
if approval and approval.get("approved"):
    return {"status": "approved"}
return {"status": "rejected"}
```
