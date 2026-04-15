---
version: 1
name: gmail-triage
description: "Reads your unread Gmail, classifies each message by urgency, and posts a summary to Slack."
inputs:
  slack_channel:
    type: string
    default: "#inbox-triage"
    description: "Slack channel to post the triage summary"
  threshold:
    type: number
    default: 3
    description: "Minimum number of urgent messages before posting"
steps:
  - id: raw_messages
    description: Fetch unread Gmail messages from the last 24 hours
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread newer_than:1d"
      maxResults: 50

  - id: messages
    description: Reshape to only the fields needed for triage
    type: transform
    expr: |
      steps.raw_messages.output.messages.{
        id: id,
        subject: headers.subject,
        from: headers.from,
        snippet: snippet
      }

  - id: empty_check
    description: If inbox is empty, return early with zero count
    type: if
    when: "$count(steps.messages.output) = 0"
    then:
      - id: return_empty
        description: Return empty inbox result
        type: return
        value: '{{ {"status": "empty", "count": 0} }}'

  - id: classified
    description: For each message, classify its urgency with an LLM
    type: foreach
    items: "{{ steps.messages.output }}"
    as: msg
    concurrency: 5
    body:
      - id: triage
        description: Classify this message as urgent, normal, or spam
        type: action
        uses: anthropic.llm
        with:
          prompt: "{{ 'Classify this email as urgent, normal, or spam.\n\nFrom: ' & msg.from & '\nSubject: ' & msg.subject & '\n\n' & msg.snippet }}"
          schema:
            type: object
            properties:
              urgency: { type: string, enum: ["urgent", "normal", "spam"] }
              reason: { type: string }
            required: [urgency, reason]

      - id: result
        description: Merge triage output with message metadata for downstream use
        type: transform
        expr: |
          {
            "subject": msg.subject,
            "from": msg.from,
            "urgency": steps.triage.output.urgency,
            "reason": steps.triage.output.reason
          }

  - id: urgent_count
    description: Count the number of urgent messages
    type: transform
    expr: "$count(steps.classified.output[result.output.urgency = 'urgent'])"

  - id: threshold_check
    description: If below threshold, return without posting to Slack
    type: if
    when: "steps.urgent_count.output < input.threshold"
    then:
      - id: return_below_threshold
        description: Return below-threshold result
        type: return
        value: '{{ {"status": "below_threshold", "urgent_count": steps.urgent_count.output} }}'

  - id: summary_text
    description: Build the Slack summary message
    type: transform
    expr: |
      '🚨 *' & $string(steps.urgent_count.output) & ' urgent emails* in the last 24h:\n\n' &
      $join(
        steps.classified.output[result.output.urgency = 'urgent'].
        ('• *' & result.output.subject & '* — ' & result.output.reason),
        '\n'
      )

  - id: post
    description: Post the triage summary to the Slack channel
    type: action
    uses: slack.post_message
    continue_on_error: true
    with:
      channel: "{{ input.slack_channel }}"
      text: "{{ steps.summary_text.output }}"

outputs:
  status: "{{ steps.urgent_count.output > 0 ? 'notified' : 'quiet' }}"
  urgent_count: "{{ steps.urgent_count.output }}"
  slack_ok: "{{ $not(steps.post.error) }}"
---

Fetches unread Gmail messages from the last 24 hours, classifies each one
individually using an LLM, and posts a Slack summary when enough urgent
messages are found.

Demonstrates:
- `action` step for integration calls
- `transform` step for reshaping API responses
- `foreach` with `concurrency` for parallel per-item LLM calls
- `if` step for conditional logic and early returns
- `continue_on_error` on actions for tolerated failures
- Step `description` fields that render as human-readable step labels in the UI
