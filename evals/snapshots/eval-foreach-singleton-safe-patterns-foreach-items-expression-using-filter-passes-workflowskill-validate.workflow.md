---
version: 1
name: invoice-email-total
description: "Searches Gmail for unread invoice emails, extracts each invoice amount using AI, and returns a grand total."
inputs:
  max_results:
    type: number
    default: 50
    description: "Maximum number of unread emails to scan"
outputs:
  total: "{{ steps.sum_amounts.output.total }}"
  invoice_count: "{{ steps.sum_amounts.output.invoice_count }}"
  invoices: "{{ steps.sum_amounts.output.invoices }}"
steps:
  - id: search
    description: Search Gmail for unread emails with 'Invoice' in the subject
    type: action
    uses: gmail.search_messages
    with:
      q: "is:unread subject:invoice"
      maxResults: "{{ input.max_results }}"

  - id: check_empty
    description: If no matching emails found, return early with zero total
    type: if
    when: "$count(steps.search.output.messages) = 0"
    then:
      - id: return_empty
        description: Return zero total when inbox has no invoice emails
        type: return
        value: '{{ {"total": 0, "invoice_count": 0, "invoices": []} }}'

  - id: fetch_and_extract
    description: For each invoice email, fetch full content and extract the amount
    type: foreach
    items: "{{ steps.search.output.messages[] }}"
    as: msg
    concurrency: 5
    body:
      - id: fetch
        description: Fetch the full email content for this message
        type: action
        uses: gmail.get_message
        with:
          id: "{{ msg.id }}"
          format: "full"

      - id: extract
        description: Extract the invoice amount from the email subject and body
        type: action
        uses: anthropic.llm
        with:
          model: "claude-haiku-4-5"
          system: "You are an invoice parser. Extract the total invoice amount as a number. If no clear amount is found, return 0."
          prompt: "Extract the total invoice amount from this email. Return only the numeric value (no currency symbol).\n\nSubject: {{ fetch.output.payload.headers[name = 'Subject'].value }}\n\nEmail preview: {{ fetch.output.snippet }}"
          schema: {"type": "object", "properties": {"amount": {"type": "number", "description": "The invoice total amount as a plain number, or 0 if not found"}}, "required": ["amount"]}

  - id: sum_amounts
    description: Sum all extracted invoice amounts into a grand total
    type: transform
    expr: |
      (
        $invoices := steps.fetch_and_extract.output.{
          "subject": fetch.output.payload.headers[name = 'Subject'].value,
          "amount": extract.output.amount
        };
        {
          "total": $reduce($invoices.amount, function($acc, $v) { $acc + $v }, 0),
          "invoice_count": $count($invoices),
          "invoices": $invoices
        }
      )
---

Searches Gmail for unread emails whose subject contains "Invoice", fetches each one in full, and uses Claude (Haiku) to extract the invoice amount from the subject and body preview. All extracted amounts are then summed into a grand total.

## What it does

1. **Search** — Queries Gmail with `is:unread subject:invoice` to find all unread invoice emails (up to `max_results`, default 50).
2. **Early exit** — If no matches are found, immediately returns `{ total: 0, invoice_count: 0, invoices: [] }`.
3. **Fetch & extract (parallel)** — For each matching email (up to 5 at a time), fetches the full message and asks Claude Haiku to extract the invoice total as a structured number.
4. **Sum** — Aggregates all extracted amounts into a grand total using a JSONata `$reduce`.

## Outputs

| Field | Description |
|---|---|
| `total` | Sum of all extracted invoice amounts |
| `invoice_count` | Number of invoice emails processed |
| `invoices` | Array of `{ subject, amount }` objects for each email |

## Notes

- The `max_results` input (default 50) caps how many emails are scanned per run.
- Amounts are extracted as plain numbers (no currency symbol). Mixed currencies are summed without conversion.
- If Claude cannot find a clear amount in an email, it returns `0` for that item.
- Requires Gmail OAuth credentials configured in your Weldable integration.
