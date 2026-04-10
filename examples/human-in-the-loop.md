---
type: workflow
name: Human in the Loop
description: "Never let an automated workflow overstep — pause for manager approval before confirming any purchase request."
inputs:
  request:
    type: str
    description: Purchase request description
  amount:
    type: float
    description: Dollar amount of the request
outputs:
  status:
    type: str
  message:
    type: str
---

## Usage

Run this workflow using the run_workflow tool.

## Workflow

```python
# Pause until a manager approves or rejects — auto-escalate after 1 hour
try:
    decision = await workflow.wait_for_signal(
        "approval",
        prompt=f"Approve purchase request for ${amount}: \"{request}\"?",
        choices=["Approve", "Reject"],
        timeout=3600,
    )
except asyncio.TimeoutError:
    return {"status": "escalated", "message": "No response within 1 hour — request auto-escalated"}

if decision["choice"] == "Approve":
    return {"status": "approved", "message": f"Approved: {request}"}
return {"status": "rejected", "message": "Rejected"}
```
