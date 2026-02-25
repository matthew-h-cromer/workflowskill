---
name: email-triage
description: Example 1 - Daily email triage with LLM scoring
---

# Email Triage

```workflow
inputs:
  max_results:
    type: int
    default: 20
  min_score:
    type: int
    default: 7

outputs:
  important_count:
    type: int
    value: $steps.format_briefing.output.items.length
  emails:
    type: array
    value: $steps.format_briefing.output.items

steps:
  - id: fetch_emails
    type: tool
    description: Fetch unread emails from the last 24 hours
    tool: gmail.search
    inputs:
      query:
        type: string
        value: "is:unread newer_than:1d"
      max_results:
        type: int
        value: $inputs.max_results
    outputs:
      messages:
        type: array
    retry:
      max: 3
      delay: "2s"
      backoff: 2.0

  - id: score_emails
    type: llm
    description: Score each email for importance and summarize
    model: haiku
    prompt: |
      Score this email from 1 to 10 for importance based on sender,
      subject, and urgency. Provide a one-sentence summary.

      From: $item.from
      Subject: $item.subject
      Body: $item.body

      Respond as JSON: { "from": "<sender>", "subject": "<subject>",
      "score": <1-10>, "summary": "<string>" }
    response_format:
      type: object
      properties:
        from: { type: string }
        subject: { type: string }
        score: { type: int }
        summary: { type: string }
    each: $steps.fetch_emails.output.messages
    inputs:
      email:
        type: object
        value: $item
    outputs:
      from: { type: string }
      subject: { type: string }
      score: { type: int }
      summary: { type: string }

  - id: filter_important
    type: transform
    description: Keep emails scoring at or above the threshold
    operation: filter
    where: $item.score >= $inputs.min_score
    inputs:
      items:
        type: array
        value: $steps.score_emails.output
    outputs:
      items: { type: array }

  - id: sort_by_score
    type: transform
    description: Sort by score, highest first
    operation: sort
    field: score
    direction: desc
    inputs:
      items:
        type: array
        value: $steps.filter_important.output.items
    outputs:
      items: { type: array }

  - id: exit_if_none
    type: exit
    description: Nothing important today
    condition: $steps.sort_by_score.output.items.length == 0
    status: success
    output:
      important_count: 0
      emails: []

  - id: format_briefing
    type: transform
    description: Shape the final output
    operation: map
    expression:
      from: $item.from
      subject: $item.subject
      score: $item.score
      summary: $item.summary
    inputs:
      items:
        type: array
        value: $steps.sort_by_score.output.items
    outputs:
      items: { type: array }

  - id: send_briefing
    type: tool
    description: Post the daily briefing to Slack
    tool: slack.post_message
    inputs:
      channel:
        type: string
        value: "#daily-briefing"
      blocks:
        type: array
        value: $steps.format_briefing.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore
```
