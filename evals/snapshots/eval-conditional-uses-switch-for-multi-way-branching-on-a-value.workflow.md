---
version: 1
name: status-slack-router
description: "Routes a status value to the matching Slack channel — posting to #pending, #approved, or #rejected based on the input."
inputs:
  status:
    type: string
    description: "The status value to route: pending, approved, or rejected"
steps:
  - id: route
    description: "Depending on status, post to the matching Slack channel"
    type: switch
    on: "input.status"
    cases:
      pending:
        - id: post_pending
          description: Post a notification to the #pending Slack channel
          type: action
          uses: slack.post_message
          with:
            channel: "#pending"
            text: "Status update: *pending*"
      approved:
        - id: post_approved
          description: Post a notification to the #approved Slack channel
          type: action
          uses: slack.post_message
          with:
            channel: "#approved"
            text: "Status update: *approved*"
      rejected:
        - id: post_rejected
          description: Post a notification to the #rejected Slack channel
          type: action
          uses: slack.post_message
          with:
            channel: "#rejected"
            text: "Status update: *rejected*"
outputs:
  channel: "{{ steps.post_pending.output.channel or steps.post_approved.output.channel or steps.post_rejected.output.channel }}"
  ts: "{{ steps.post_pending.output.ts or steps.post_approved.output.ts or steps.post_rejected.output.ts }}"
---

Routes an input `status` string to its dedicated Slack channel. Use this workflow to fan out status change notifications — whichever case matches (`pending`, `approved`, or `rejected`), the corresponding channel receives the message and the posted message's timestamp and channel ID are returned as outputs.
