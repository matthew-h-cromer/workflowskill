---
version: 1
name: gmail-unread-to-slack
description: "Fetches unread Gmail messages and posts a summary to Slack — or exits immediately when the inbox is empty."
inputs:
  slack_channel:
    type: string
    default: "#inbox-digest"
    description: "Slack channel to post the summary to"
  max_results:
    type: number
    default: 20
    description: "Maximum number of unread messages to fetch"
steps:
  - id: fetch_unread
    description: Fetch unread Gmail messages
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread"
      maxResults: "{{ input.max_results }}"

  - id: check_empty
    description: If inbox is empty, return immediately with status='empty'
    type: if
    when: "$count(steps.fetch_unread.output.messages) = 0"
    then:
      - id: return_empty
        description: Return empty status when there are no unread messages
        type: return
        value: '{{ {"status": "empty", "count": 0} }}'

  - id: build_summary
    description: Build a summary string listing unread message count
    type: transform
    expr: |
      "You have " & $string($count(steps.fetch_unread.output.messages)) & " unread message(s) in your Gmail inbox."

  - id: notify_slack
    description: Post the unread-mail summary to Slack
    type: action
    uses: slack.post_message
    with:
      channel: "{{ input.slack_channel }}"
      text: "{{ steps.build_summary.output }}"

outputs:
  status: "notified"
  count: "{{ $count(steps.fetch_unread.output.messages) }}"
  slack_ts: "{{ steps.notify_slack.output.ts }}"
---

Fetches all unread Gmail messages and posts a digest summary to a Slack channel.

- If the inbox has **no unread messages**, the workflow exits immediately and returns `{ status: "empty", count: 0 }` — no Slack message is sent.
- If there **are unread messages**, it posts a summary line to the configured Slack channel (default `#inbox-digest`) and returns `{ status: "notified", count: N, slack_ts: "..." }`.

**Inputs**
| Name | Type | Default | Description |
|---|---|---|---|
| `slack_channel` | string | `#inbox-digest` | Slack channel to post the summary to |
| `max_results` | number | `20` | Maximum unread messages to fetch |

**Setup required:** Gmail and Slack integrations must be connected in Weldable before running this workflow.
