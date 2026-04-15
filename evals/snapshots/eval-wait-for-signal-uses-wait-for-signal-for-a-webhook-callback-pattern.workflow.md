---
version: 1
name: job-submit-wait-notify
description: "Submit a job to an external processing API, durably wait for a webhook signal confirming completion, then email the result — even if processing takes hours."
inputs:
  api_url:
    type: string
    description: "The URL of the external processing API endpoint"
  api_key:
    type: string
    description: "API key for authenticating with the processing API"
  job_payload:
    type: string
    description: "JSON string of the job payload to submit"
  notify_email:
    type: string
    description: "Email address to notify when the job completes"
outputs:
  job_id: "{{ steps.extract_job_id.output.job_id }}"
  status: "{{ steps.check_timeout.output }}"
  email_id: "{{ steps.send_notification.output.id }}"
steps:
  - id: submit_job
    description: Submit the job to the external processing API
    type: action
    uses: web.api
    with:
      url: "{{ input.api_url }}"
      method: POST
      headers:
        Authorization: "{{ 'Bearer ' & input.api_key }}"
        Content-Type: "application/json"
      body: "{{ input.job_payload }}"
    retry:
      max_attempts: 3
      backoff: exponential

  - id: extract_job_id
    description: Parse the API response body and extract the job_id
    type: transform
    expr: "$eval(steps.submit_job.output.body)"

  - id: wait_for_completion
    description: Wait for the job.completed webhook signal carrying this job's ID
    type: wait_for_signal
    signal: "job.completed"
    match:
      "job_id": "{{ steps.extract_job_id.output.job_id }}"
    timeout: "24h"
    on_timeout: continue

  - id: check_timeout
    description: If the signal timed out, surface timed-out status; otherwise surface completed
    type: if
    when: "steps.wait_for_completion.output = null"
    then:
      - id: timed_out_result
        description: Return a timed-out status string
        type: transform
        expr: "'timed_out'"
    else:
      - id: completed_result
        description: Return a completed status string
        type: transform
        expr: "'completed'"

  - id: build_email_body
    description: Build the plain-text notification email with job ID, status, and result payload
    type: transform
    expr: |
      "To: " & input.notify_email & "\n" &
      "Subject: Job " & steps.extract_job_id.output.job_id & " — " & steps.check_timeout.output & "\n" &
      "Content-Type: text/plain\n" &
      "\n" &
      "Your job has finished.\n\n" &
      "Job ID: " & steps.extract_job_id.output.job_id & "\n" &
      "Status: " & steps.check_timeout.output & "\n\n" &
      $string(steps.wait_for_completion.output)

  - id: send_notification
    description: Send the notification email to the requester
    type: action
    uses: gmail.send_message
    with:
      raw: "{{ steps.build_email_body.output }}"
---

Submits a job to an external HTTP processing API, then durably waits — up to 24 hours — for an inbound `job.completed` webhook signal whose payload contains the matching `job_id`. Once the signal arrives (or the timeout elapses), it sends a notification email summarising the job ID, final status, and the raw result payload.

## Inputs

| Input | Description |
|---|---|
| `api_url` | The external processing API endpoint to POST the job to |
| `api_key` | Bearer token used to authenticate with the API |
| `job_payload` | JSON string of the job body to submit |
| `notify_email` | Email address that receives the completion notification |

## How it works

1. **Submit** — POSTs `job_payload` to `api_url` with a `Bearer` auth header. Retries up to 3 times with exponential back-off on transient errors.
2. **Extract** — Parses the JSON response body and reads the `job_id` field.
3. **Wait** — Suspends the workflow until a `job.completed` signal arrives with a matching `job_id` in its payload. The workflow is durable across restarts and can safely wait for hours (up to 24h).
4. **Timeout guard** — If no signal arrives within 24 hours, execution continues rather than aborting, and the email reflects the `timed_out` status.
5. **Notify** — Sends a plain-text email to `notify_email` containing the job ID, final status, and signal payload (or a timeout notice).

## Notes

- The wait timeout is hardcoded to `24h`. To change it, edit the `timeout` field on the `wait_for_completion` step before deploying.
- The external API response must include a top-level `job_id` field in its JSON body.
- The inbound webhook signal must carry `job_id` at the top level of its payload for the match filter to work.
