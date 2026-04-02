---
type: workflow
name: human-in-the-loop
description: Pause for manager approval before confirming a purchase request.
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
        prompt=f"Approve purchase request for ${amount}: \"{request}\"? Send {{\"approved\": true}} or {{\"approved\": false, \"reason\": \"...\"}}",
        timeout=3600,
    )
except asyncio.TimeoutError:
    return {"status": "escalated", "message": "No response within 1 hour — request auto-escalated"}

if decision and decision.get("approved"):
    return {"status": "approved", "message": f"Approved: {request}"}
return {"status": "rejected", "message": decision.get("reason", "No reason provided") if decision else "Rejected"}
```
