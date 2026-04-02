---
type: workflow
name: approval-gate
description: Submits a request to an API endpoint, then waits for human approval before returning the outcome.
actions: [web.api]
inputs:
  request:
    type: str
    description: "The request payload to submit for approval"
outputs:
  status:
    type: str
    description: "Outcome of the approval gate: 'approved' or 'rejected'"
---

# Approval Gate

## Usage

Run this workflow using the run_workflow tool

## Details

Submits the `request` string to `https://example.com/api/submit` as a JSON
POST body, then pauses and waits for a human to send an `approval` signal.

The signal data must be a JSON object. If `approved` is `true` the workflow
returns `{"status": "approved"}`; any other value (or no data) returns
`{"status": "rejected"}`.

**Prerequisites:** The `web.api` action must be available in the runtime
context. No OAuth connection is required for this action.

## Workflow

```python
# Submit the request to the API endpoint
submission = await workflow.execute_activity(
    "web.api",
    {
        "url": "https://example.com/api/submit",
        "method": "POST",
        "body": {"request": request},
    },
)

# Pause until a human sends the 'approval' signal
approval = await workflow.wait_for_signal(
    "approval",
    prompt="Send approval signal with {\"approved\": true} to approve, or {\"approved\": false} to reject.",
)

# Evaluate the signal data and return the outcome
if approval and approval.get("approved") is True:
    return {"status": "approved"}
return {"status": "rejected"}
```
