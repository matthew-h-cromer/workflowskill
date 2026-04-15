---
version: 1
name: gmail-urgent-slack-alert
description: "Searches Gmail for emails with URGENT in the subject and posts a Slack alert if any are found, otherwise returns a quiet status."
inputs:
  slack_channel:
    type: string
    default: "#alerts"
    description: "Slack channel to post the urgent-email alert to"
  max_results:
    type: number
    default: 10
    description: "Maximum number of urgent emails to retrieve"
outputs:
  status: "{{ steps.result.output.status }}"
  urgent_count: "{{ steps.result.output.urgent_count }}"
steps:
  - id: search
    description: Search Gmail for emails with URGENT in the subject
    type: action
    uses: gmail.search_messages
    with:
      q: "subject:URGENT"
      maxResults: "{{ input.max_results }}"

  - id: check_urgent
    description: If urgent emails found, post a Slack alert; otherwise return quiet status
    type: if
    when: "$count(steps.search.output.messages) > 0"
    then:
      - id: alert
        description: Post an urgent-email alert to Slack
        type: action
        uses: slack.post_message
        with:
          channel: "{{ input.slack_channel }}"
          text: "{{ ':rotating_light: *Urgent emails detected!* ' & $string($count(steps.search.output.messages)) & ' email(s) with URGENT in the subject found in your inbox.' }}"

      - id: result
        description: Return alert-sent status with the count of urgent emails
        type: transform
        expr: |
          {
            "status": "alert_sent",
            "urgent_count": $count(steps.search.output.messages)
          }
    else:
      - id: result
        description: Return quiet status when no urgent emails are found
        type: transform
        expr: |
          {
            "status": "no_urgent_emails",
            "urgent_count": 0
          }
---

Searches Gmail for emails that contain "URGENT" in the subject line. If any matching emails are found, it posts an alert message to a configurable Slack channel (default: `#alerts`) detailing how many urgent emails were detected. If no urgent emails exist, the workflow exits quietly with a `no_urgent_emails` status — no Slack message is sent.

**Inputs**
- `slack_channel` — Slack channel to post the alert to (default: `#alerts`)
- `max_results` — Maximum number of urgent emails to retrieve (default: 10)

**Outputs**
- `status` — `alert_sent` or `no_urgent_emails`
- `urgent_count` — Number of urgent emails found

**Integrations used**
- Gmail — `gmail.search_messages`
- Slack — `slack.post_message`
