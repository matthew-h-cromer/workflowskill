---
version: 1
name: async-data-export
description: "Starts an async data export job, waits up to 30 minutes for a ready signal, then either downloads and posts the result to Slack or sends an error email on timeout."
inputs:
  export_url:
    type: string
    description: "API endpoint to POST to in order to start the export job"
  result_url:
    type: string
    description: "URL to download the export result from once the signal arrives"
  notify_email:
    type: string
    description: "Email address to notify on timeout failure"
  slack_channel:
    type: string
    default: "#data-exports"
    description: "Slack channel to post the successful export result to"
steps:
  - id: start_export
    description: Start the async data export job via the API
    type: action
    uses: web.api
    with:
      url: "{{ input.export_url }}"
      method: POST

  - id: wait_for_export
    description: Wait for the export.ready signal, up to 30 minutes
    type: wait_for_signal
    signal: "export.ready"
    match:
      "job_id": "{{ steps.start_export.output.body }}"
    timeout: "30m"
    on_timeout: continue

  - id: check_timeout
    description: If no signal arrived, send an error email; otherwise download and post to Slack
    type: if
    when: "steps.wait_for_export.output = null"
    then:
      - id: send_error_email
        description: Send a timeout error notification email
        type: action
        uses: gmail.send_message
        with:
          raw: "To: {{ input.notify_email }}\nSubject: Data Export Failed — Timed Out\n\nThe data export job did not complete within 30 minutes. Please check the export service and retry.\n\nJob start payload: {{ steps.start_export.output.body }}"
    else:
      - id: download_result
        description: Download the export result from the provided URL
        type: action
        uses: web.fetch
        with:
          url: "{{ input.result_url }}"

      - id: post_to_slack
        description: Post the export result to the Slack channel
        type: action
        uses: slack.post_message
        with:
          channel: "{{ input.slack_channel }}"
          text: "{{ ':white_check_mark: *Data export complete!*\n\n*' & steps.download_result.output.title & '*\n\n' & steps.download_result.output.content }}"
---

Starts an async data export job by POSTing to a configurable API endpoint, then
pauses and listens for an `export.ready` webhook signal for up to 30 minutes.

**On success** (signal arrives within 30 minutes): fetches the export result
from the result URL and posts it to a Slack channel.

**On timeout** (no signal within 30 minutes): sends an error notification email
to the configured address so the team can investigate.

## Inputs

| Input | Description |
|---|---|
| `export_url` | API endpoint to POST to in order to kick off the export |
| `result_url` | URL to download the export result from once ready |
| `notify_email` | Email address to receive failure/timeout notifications |
| `slack_channel` | Slack channel for the success post (default: `#data-exports`) |

## Integrations used

- **HTTP (`web.api`)** — starts the export job
- **HTTP (`web.fetch`)** — downloads the export result
- **Gmail (`gmail.send_message`)** — sends timeout error emails
- **Slack (`slack.post_message`)** — delivers the export result to the team
