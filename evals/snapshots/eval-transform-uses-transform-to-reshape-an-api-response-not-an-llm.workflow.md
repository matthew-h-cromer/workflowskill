---
version: 1
name: unread-gmail-summary
description: "Fetches all unread Gmail messages and returns a clean list of subject and sender for each one — no LLM required."
inputs:
  maxResults:
    type: number
    default: 25
    description: "Maximum number of unread messages to fetch"
outputs:
  messages: "{{ steps.reshape.output }}"
steps:
  - id: search
    description: Search Gmail for unread messages
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread"
      maxResults: "{{ input.maxResults }}"

  - id: safe_messages
    description: Coerce the messages list to an empty array if no results were returned
    type: transform
    expr: "$exists(steps.search.output.messages) ? steps.search.output.messages : []"

  - id: fetch_each
    description: For each unread message, fetch its metadata
    type: foreach
    items: "{{ steps.safe_messages.output }}"
    as: msg
    concurrency: 5
    body:
      - id: details
        description: Fetch subject and from headers for this message
        type: action
        uses: gmail.get_message
        with:
          id: "{{ msg.id }}"
          format: "metadata"

  - id: reshape
    description: Extract subject and from fields into a clean flat list
    type: transform
    expr: |
      steps.fetch_each.output.{
        "subject": details.output.payload.headers[name = "Subject"].value,
        "from": details.output.payload.headers[name = "From"].value
      }
---

Fetches unread messages from Gmail and returns a clean array of `{ subject, from }` objects — one per message. No LLM is involved; all reshaping is done with a deterministic JSONata transform directly over the Gmail API response headers.

## Steps

1. **Search** — calls `gmail.search_messages` with `is:unread` to get the list of unread message IDs.
2. **Safe coerce** — guards against a null/undefined `messages` field by defaulting to `[]`.
3. **Fetch each** — fans out concurrently (up to 5 at a time) with `gmail.get_message` in `metadata` format to retrieve only the headers needed, keeping the payload small.
4. **Reshape** — a `transform` step uses JSONata to project `Subject` and `From` out of each message's `payload.headers` array into a flat, clean list.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `maxResults` | number | 25 | Maximum number of unread messages to retrieve |

## Outputs

`messages` — array of objects, each with:
- `subject` — the email subject line
- `from` — the sender address / display name
