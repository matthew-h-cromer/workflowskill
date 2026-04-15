---
version: 1
name: gmail-urgent-slack-alert
description: "Searches Gmail for emails with URGENT in the subject and posts a Slack alert if any are found — keeping your team instantly informed of critical messages."
inputs:
  slack_channel:
    type: string
    default: "#alerts"
    description: "Slack channel to post the urgent-email alert to"
  max_results:
    type: number
    default: 10
    description: "Maximum number of urgent emails to surface"
outputs:
  status: "{{ steps.result.output.status }}"
  urgent_count: "{{ steps.result.output.count }}"
steps:
  - id: search
    description: Search Gmail for emails with URGENT in the subject
    type: action
    uses: gmail.search_messages
    with:
      q: "subject:URGENT"
      maxResults: "{{ input.max_results }}"

  - id: check_urgent
    description: If urgent emails found, alert Slack; otherwise return quiet status
    type: if
    when: "$count(steps.search.output.messages) > 0"
    then:
      - id: format_subjects
        description: Build a bullet list of message IDs for the Slack alert
        type: transform
        expr: |
          "🚨 *" & $string($count(steps.search.output.messages)) & " URGENT email(s) found in your inbox:*\n" &
          $join(steps.search.output.messages.("• Message ID: " & id), "\n")

      - id: notify
        description: Post the urgent-email alert to Slack
        type: action
        uses: slack.post_message
        with:
          channel: "{{ input.slack_channel }}"
          text: "{{ steps.format_subjects.output }}"

      - id: result
        description: Return alerted status with the count of urgent emails
        type: transform
        expr: |
          {
            "status": "alerted",
            "count": $count(steps.search.output.messages)
          }
    else:
      - id: result
        description: Return quiet status when no urgent emails are found
        type: transform
        expr: |
          {
            "status": "quiet",
            "count": 0
          }
---

Searches Gmail for any emails whose subject contains **URGENT**. If one or more are found, it posts a formatted Slack alert to your chosen channel (default: `#alerts`) listing how many urgent messages arrived. If the inbox is clear, the workflow exits silently with a `quiet` status — no Slack noise.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `slack_channel` | string | `#alerts` | Channel to post the alert to |
| `max_results` | number | `10` | Cap on urgent emails to surface per run |

## Outputs

| Name | Description |
|---|---|
| `status` | `"alerted"` if a Slack message was posted, `"quiet"` if the inbox was clear |
| `urgent_count` | Number of urgent emails found (0 when quiet) |

## Setup

1. Connect your **Gmail** integration (read-only scope is sufficient).
2. Connect your **Slack** integration with `chat:write` scope.
3. Set `slack_channel` to the channel where alerts should appear.
