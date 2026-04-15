---
version: 1
name: human-review
description: "Drafts a document, waits for a human review signal, then sends it — or records a rejection if the reviewer says no."
inputs:
  topic:
    type: string
    description: "What to write about"
  recipient:
    type: string
    description: "Email address to send the approved document to"
  reviewer:
    type: string
    description: "Email address of the person who will review the draft"
steps:
  - id: draft
    description: Generate the draft document with Claude
    type: action
    uses: anthropic.llm
    with:
      prompt: "{{ 'Write a concise professional email about: ' & input.topic & '. Return JSON with fields: subject (string) and body (string).' }}"
      schema:
        type: object
        properties:
          subject: { type: string }
          body: { type: string }
        required: [subject, body]

  - id: review
    description: Wait for the reviewer's decision signal, up to 24 hours
    type: wait_for_signal
    signal: "human_review.decision"
    match:
      "reviewer": "{{ input.reviewer }}"
      "run_id": "{{ workflow.run_id }}"
    timeout: "24h"
    on_timeout: continue

  - id: check_timeout
    description: If review timed out, return timed-out status
    type: if
    when: "$not($exists(steps.review.output))"
    then:
      - id: return_timed_out
        description: Return timed-out result
        type: return
        value: '{{ {"status": "timed_out"} }}'

  - id: check_rejected
    description: If reviewer rejected, return rejected status
    type: if
    when: "steps.review.output.decision = 'reject'"
    then:
      - id: return_rejected
        description: Return rejected result with reviewer info
        type: return
        value: '{{ {"status": "rejected", "reviewer": steps.review.output.reviewer} }}'

  - id: format_email
    description: Format the approved document as a raw email message
    type: transform
    expr: |
      'To: ' & input.recipient & '\r\nSubject: ' & steps.review.output.subject & '\r\n\r\n' & steps.review.output.body

  - id: sent
    description: Send the approved document to the recipient
    type: action
    uses: gmail.send_message
    with:
      raw: "{{ steps.format_email.output }}"

outputs:
  status: "sent"
  approved_by: "{{ steps.review.output.reviewer }}"
  responded_at: "{{ steps.review.output.responded_at }}"
---

Generates a draft, then durably waits for an external review signal carrying
the reviewer's decision (and any edits they made). Sends the final version to
the recipient when approved, or returns a rejection / timed-out status otherwise.

The review UI is entirely up to the runtime or an external service: render the
draft however you like, collect the reviewer's input, then post a
`human_review.decision` signal with shape:

```json
{
  "reviewer": "alice@example.com",
  "run_id": "<workflow.run_id>",
  "decision": "approve" | "reject",
  "subject": "Edited subject",
  "body": "Edited body",
  "responded_at": "2026-04-14T12:00:00Z"
}
```

Demonstrates:
- `wait_for_signal` as a generic human-in-the-loop gate (no dedicated `approval` primitive)
- `match:` filtering to correlate the signal with this run
- `on_timeout: continue` + `if` guards for timeout / rejection paths
