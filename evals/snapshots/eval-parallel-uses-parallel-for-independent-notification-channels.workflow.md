---
version: 1
name: order-confirmed-notify
description: "When an order is confirmed, simultaneously sends a confirmation email via Gmail and posts a notification to the #orders Slack channel."
inputs:
  order_id:
    type: string
    description: "The unique identifier for the confirmed order"
  customer_email:
    type: string
    description: "The customer's email address to send the confirmation to"
  customer_name:
    type: string
    description: "The customer's name for personalising the messages"
  order_summary:
    type: string
    description: "A short summary of the order contents"
outputs:
  email_id: "{{ steps.notify.branches.email.send_email.output.id }}"
  slack_ts: "{{ steps.notify.branches.slack.post_slack.output.ts }}"
steps:
  - id: notify
    description: "In parallel, send the confirmation email and post the Slack notification"
    type: parallel
    branches:
      email:
        - id: send_email
          description: "Send the order confirmation email to the customer"
          type: action
          uses: gmail.send_message
          with:
            raw: |
              To: {{ input.customer_email }}
              Subject: Your order {{ input.order_id }} is confirmed!

              Hi {{ input.customer_name }},

              Great news — your order {{ input.order_id }} has been confirmed.

              Order summary: {{ input.order_summary }}

              Thank you for your purchase!
      slack:
        - id: post_slack
          description: "Post the order confirmation notification to #orders"
          type: action
          uses: slack.post_message
          with:
            channel: "#orders"
            text: "{{ ':white_check_mark: Order *' & input.order_id & '* confirmed for ' & input.customer_name & ' — ' & input.order_summary }}"
---

When an order is confirmed, this workflow fans out two independent notifications at the same time:

1. **Confirmation email** — sends a personalised order confirmation to the customer via Gmail, including their name, order ID, and a summary of what they ordered.
2. **Slack notification** — posts a concise ✅ alert to the `#orders` channel so the team is immediately aware of the new confirmed order.

Both actions run in parallel, so neither waits on the other — total latency is determined by whichever notification takes longer, not the sum of both.

### Inputs

| Input | Description |
|---|---|
| `order_id` | Unique identifier for the confirmed order |
| `customer_email` | Customer's email address |
| `customer_name` | Customer's name (used in both the email and Slack message) |
| `order_summary` | Short description of the order contents |

### Outputs

| Output | Description |
|---|---|
| `email_id` | Gmail message ID of the sent confirmation email |
| `slack_ts` | Timestamp of the posted Slack message |
