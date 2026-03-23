---
type: workflow
name: approval-gate
description: Submits a request to an API endpoint and waits for human approval before returning the outcome.
actions: [api]
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

Submits a request string to `https://example.com/api/submit`, then durably
pauses until a human sends an `approval` signal. The workflow survives
restarts while waiting — it will resume as soon as the signal arrives.

Send the signal with `{"approved": true}` to approve, or `{"approved": false}`
(or any other value) to reject.

## Workflow

```python
# Submit the request to the API
await workflow.execute_activity(
    "api",
    {
        "url": "https://example.com/api/submit",
        "method": "POST",
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"request": request}),
    },
)

# Pause until a human sends the approval signal
signal_data = await workflow.wait_for_signal(
    "approval",
    prompt="Send approval signal with {\"approved\": true} to approve or {\"approved\": false} to reject.",
)

# Return outcome based on signal data
if signal_data and signal_data.get("approved") is True:
    return {"status": "approved"}
return {"status": "rejected"}
```
