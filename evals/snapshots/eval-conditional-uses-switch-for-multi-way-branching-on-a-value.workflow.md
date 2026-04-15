---
version: 1
name: status-slack-router
description: "Routes a status value to the matching Slack channel — pending, approved, or rejected — so every update lands in exactly the right place."
inputs:
  status:
    type: string
    description: "The status to route: 'pending', 'approved', or 'rejected'."
steps:
  - id: route
    description: "Depending on status, post to the matching Slack channel"
    type: switch
    on: "input.status"
    cases:
      pending:
        - id: post_pending
          description: Post status update to the #pending channel
          type: action
          uses: slack.post_message
          with:
            channel: "#pending"
            text: "Status update: *pending*"
      approved:
        - id: post_approved
          description: Post status update to the #approved channel
          type: action
          uses: slack.post_message
          with:
            channel: "#approved"
            text: "Status update: *approved*"
      rejected:
        - id: post_rejected
          description: Post status update to the #rejected channel
          type: action
          uses: slack.post_message
          with:
            channel: "#rejected"
            text: "Status update: *rejected*"
---

Routes an input `status` string to the matching Slack channel using a `switch` branch.

- **`pending`** → posts to `#pending`
- **`approved`** → posts to `#approved`
- **`rejected`** → posts to `#rejected`

If `status` doesn't match any of the three cases, no message is posted (no `default` branch is needed unless you want a fallback). Connect this workflow to any trigger that produces a status string — a form submission, a database webhook, an approval API — and your team will always be notified in the right channel.
