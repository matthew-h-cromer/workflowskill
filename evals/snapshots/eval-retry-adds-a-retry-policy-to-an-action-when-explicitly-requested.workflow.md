---
version: 1
name: post-webhook-with-retry
description: "POST to an external webhook URL with automatic retry (up to 3 attempts, exponential backoff) to reliably deliver payloads to unreliable endpoints."
inputs:
  webhook_url:
    type: string
    description: "The target webhook URL to POST to"
  payload:
    type: string
    description: "JSON string payload to send in the request body"
    default: "{}"
  content_type:
    type: string
    description: "Content-Type header value for the request"
    default: "application/json"
outputs:
  status: "{{ steps.call_webhook.output.status }}"
  body: "{{ steps.call_webhook.output.body }}"
  headers: "{{ steps.call_webhook.output.headers }}"
steps:
  - id: call_webhook
    description: POST the payload to the webhook, retrying with exponential backoff
    type: action
    uses: web.api
    with:
      url: "{{ input.webhook_url }}"
      method: "POST"
      headers:
        Content-Type: "{{ input.content_type }}"
      body: "{{ input.payload }}"
    retry:
      max_attempts: 3
      backoff: exponential
---

POSTs a payload to any external webhook URL. Because webhooks can be
temporarily unreliable (network blips, upstream restarts, rate-limit spikes),
the action automatically retries up to **3 times** using **exponential
backoff** before giving up.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `webhook_url` | string | *(required)* | The full URL of the webhook endpoint to call |
| `payload` | string | `"{}"` | The JSON string to send as the request body |
| `content_type` | string | `"application/json"` | Value of the `Content-Type` request header |

## Outputs

| Name | Description |
|---|---|
| `status` | HTTP status code returned by the webhook |
| `body` | Response body string returned by the webhook |
| `headers` | Response headers returned by the webhook |

## When to use

- Triggering downstream systems (CI pipelines, notification services, data
  pipelines) where the endpoint may be momentarily unavailable.
- Delivering event payloads to third-party webhooks that occasionally return
  5xx errors.

## Setup

No credentials are required — the workflow calls the URL directly. If the
webhook requires authentication, include an `Authorization` header by
extending the `headers` block in the workflow definition.
