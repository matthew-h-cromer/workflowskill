---
version: 1
name: sheet-welcome-message-generator
description: "Reads user emails from a Google Sheet and generates a personalized welcome message for each one using Claude AI, processing up to 5 users concurrently."
inputs:
  spreadsheet_id:
    type: string
    description: "The Google Sheets spreadsheet ID (found in the sheet's URL)"
  range:
    type: string
    default: "Sheet1!A2:A"
    description: "A1-notation range containing the email column, e.g. 'Sheet1!A2:A'"
outputs:
  results: "{{ steps.collect_results.output }}"
steps:
  - id: read_sheet
    description: Fetch the list of user emails from the Google Sheet
    type: action
    uses: google_sheets.read
    with:
      spreadsheetId: "{{ input.spreadsheet_id }}"
      range: "{{ input.range }}"

  - id: extract_emails
    description: Flatten the 2D values array into a plain list of email strings
    type: transform
    expr: "steps.read_sheet.output.values[].([0])"

  - id: check_empty
    description: If no emails were found, return early with an empty result
    type: if
    when: "$count(steps.extract_emails.output) = 0"
    then:
      - id: return_empty
        description: Return empty result when the sheet has no email rows
        type: return
        value: '{{ {"status": "no_users", "results": []} }}'

  - id: generate_messages
    description: For each email, generate a personalized welcome message (5 at a time)
    type: foreach
    items: "{{ steps.extract_emails.output }}"
    as: email
    concurrency: 5
    body:
      - id: welcome
        description: Ask Claude to write a warm, personalized welcome message for this user
        type: action
        uses: anthropic.llm
        with:
          system: "You are a friendly onboarding assistant. Write concise, warm, and personalized welcome messages."
          prompt: "{{ 'Write a short, personalized welcome message for a new user whose email address is: ' & email & '. Address them by the name part of their email (before the @). Keep it under 3 sentences.' }}"
          model: "claude-haiku-4-5"
          max_tokens: 256

  - id: collect_results
    description: Shape the foreach results into a list of email-to-message pairs
    type: transform
    expr: |
      steps.generate_messages.output.{
        "email": $keys()[0],
        "message": welcome.output.textOutput
      }[]
---

Reads a column of user emails from a Google Sheet, then calls Claude for each one to generate a short, personalized welcome message. Up to 5 messages are generated in parallel to keep things fast, even for large lists.

## Inputs

| Input | Required | Description |
|---|---|---|
| `spreadsheet_id` | ✅ | The ID from the Google Sheets URL (the long string between `/d/` and `/edit`) |
| `range` | ✅ (default: `Sheet1!A2:A`) | A1-notation range for the email column — defaults to everything below the header row of the first sheet |

## Outputs

`results` — an array of objects, each containing:
- `email` — the user's email address
- `message` — Claude's personalized welcome message

## Setup

1. Your Google Sheet should have user email addresses in a single column (e.g. column A).
2. Set `range` to cover all rows **below** the header (e.g. `Sheet1!A2:A`) so the header isn't treated as an email.
3. The workflow stops early and returns `{ status: "no_users" }` if the sheet is empty.
