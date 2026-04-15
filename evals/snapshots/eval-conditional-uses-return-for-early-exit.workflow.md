---
version: 1
name: gmail-unread-to-slack
description: "Fetches unread Gmail messages and posts a summary to Slack, or returns immediately when the inbox is empty."
inputs:
  slack_channel:
    type: string
    default: "#general"
    description: "Slack channel to post the summary to"
  max_results:
    type: number
    default: 10
    description: "Maximum number of unread messages to fetch"
outputs:
  status: "{{ steps.result.output.status }}"
steps:
  - id: fetch_unread
    description: Fetch unread Gmail messages from the inbox
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread in:inbox"
      maxResults: "{{ input.max_results }}"

  - id: check_empty
    description: If inbox is empty, return immediately with status='empty'
    type: if
    when: "$count(steps.fetch_unread.output.messages) = 0"
    then:
      - id: result
        description: Return empty status immediately
        type: return
        value: '{{ {"status": "empty"} }}'

  - id: build_summary
    description: Build a readable summary of the unread messages
    type: transform
    expr: |
      "You have " & $string($count(steps.fetch_unread.output.messages)) & " unread message(s) in your inbox."

  - id: notify_slack
    description: Post the unread messages summary to the Slack channel
    type: action
    uses: slack.post_message
    with:
      channel: "{{ input.slack_channel }}"
      text: "{{ steps.build_summary.output }}"

  - id: result
    description: Return notified status after posting to Slack
    type: transform
    expr: '{"status": "notified"}'
---

Fetches unread messages from your Gmail inbox and posts a summary to a Slack channel.
If the inbox is empty, the workflow exits early with `status='empty'`.
Otherwise, it posts a message showing the unread count to the configured Slack channel
and returns `status='notified'`.

**Inputs**
- `slack_channel` — Slack channel to post to (default: `#general`)
- `max_results` — Maximum number of unread messages to retrieve (default: `10`)

**Output**
- `status` — Either `"empty"` (no unread mail) or `"notified"` (Slack post sent)
