---
version: 1
name: gmail-unread-last-24h
description: "Search Gmail for unread messages from the last 24 hours and return them."
inputs:
  maxResults:
    type: number
    default: 50
    description: "Maximum number of messages to return (default: 50)"
outputs:
  messages: "{{ steps.search.output.messages }}"
  resultSizeEstimate: "{{ steps.search.output.resultSizeEstimate }}"
steps:
  - id: search
    description: Search Gmail for unread messages from the last 24 hours
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread newer_than:1d"
      maxResults: "{{ input.maxResults }}"
---

Searches Gmail for all unread messages received in the last 24 hours and returns the matching message list alongside an estimated total count.

## Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `maxResults` | number | 50 | Maximum number of messages to return |

## Outputs

| Output | Description |
|---|---|
| `messages` | Array of matching message objects (each with `id` and `threadId`) |
| `resultSizeEstimate` | Gmail's estimated total number of matching messages |

## Setup

Requires a connected Gmail integration with read access to your inbox.
