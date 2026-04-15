---
version: 1
name: gmail-message-classifier
description: "Fetches your unread Gmail messages and classifies each one individually as urgent, normal, or spam using Claude AI."
inputs:
  maxResults:
    type: number
    default: 20
    description: "Maximum number of unread messages to fetch and classify"
outputs:
  classified_messages: "{{ steps.summarise.output }}"
steps:
  - id: fetch_unread
    description: Fetch unread Gmail messages
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread"
      maxResults: "{{ input.maxResults }}"

  - id: check_empty
    description: If no unread messages found, return early with an empty result
    type: if
    when: "$count(steps.fetch_unread.output.messages) = 0"
    then:
      - id: return_empty
        description: Return empty result when inbox has no unread messages
        type: return
        value: '{{ {"status": "no_unread_messages", "classified_messages": []} }}'

  - id: classify_each
    description: For each unread message, fetch its content and classify its urgency
    type: foreach
    items: "{{ steps.fetch_unread.output.messages }}"
    as: msg
    concurrency: 5
    body:
      - id: full_message
        description: Fetch the full content of this message
        type: action
        uses: gmail.get_message
        with:
          id: "{{ msg.id }}"
          format: "metadata"

      - id: classify
        description: Classify this message as urgent, normal, or spam using Claude
        type: action
        uses: anthropic.llm
        with:
          model: "claude-haiku-4-5"
          system: "You are an email triage assistant. Classify emails strictly as one of: urgent, normal, or spam."
          prompt: "{{ 'Classify this email.\n\nSubject: ' & steps.full_message.output.payload.headers[name='Subject'].value & '\nSnippet: ' & steps.full_message.output.snippet }}"
          schema:
            type: object
            properties:
              category:
                type: string
                enum:
                  - urgent
                  - normal
                  - spam
              reason:
                type: string
            required:
              - category
              - reason

  - id: summarise
    description: Reshape per-iteration results into a clean classified-messages array
    type: transform
    expr: |
      steps.classify_each.output.{
        "id": full_message.output.id,
        "threadId": full_message.output.threadId,
        "subject": full_message.output.payload.headers[name='Subject'].value,
        "snippet": full_message.output.snippet,
        "category": classify.output.category,
        "reason": classify.output.reason
      }
---

Fetches all unread messages from Gmail (up to a configurable limit) and classifies every message **individually** — one Claude call per email, never batched. Each message is enriched with its subject, snippet, a classification (`urgent`, `normal`, or `spam`), and a short reason explaining the decision.

## What it does

1. **Searches Gmail** for all unread messages using `is:unread`.
2. **Exits early** if the inbox is empty, returning a clean `no_unread_messages` status.
3. **For each message** (up to 5 in parallel):
   - Fetches the full message metadata (subject, snippet, headers).
   - Sends the subject and snippet to Claude (Haiku) with a structured-output schema, getting back a `category` and `reason`.
4. **Returns** a clean array of classified messages with id, threadId, subject, snippet, category, and reason.

## Integrations used

- **Gmail** — reads unread messages
- **Anthropic (Claude Haiku)** — classifies each message individually

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `maxResults` | number | 20 | Maximum number of unread messages to fetch |

## Outputs

`classified_messages` — array of objects, each containing:
- `id` — Gmail message ID
- `threadId` — Gmail thread ID
- `subject` — Email subject line
- `snippet` — Short preview of the email body
- `category` — `urgent` | `normal` | `spam`
- `reason` — Claude's explanation for the classification
