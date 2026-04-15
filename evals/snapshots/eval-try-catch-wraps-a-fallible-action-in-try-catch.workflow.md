---
version: 1
name: post-summary-to-slack
description: "Posts a summary message to a Slack channel and, if the post fails for any reason, warns the ops channel and continues without crashing the workflow."
inputs:
  channel:
    type: string
    default: "#general"
    description: "The Slack channel to post the summary to (e.g. #releases, #team-updates)."
  summary:
    type: string
    default: "Workflow summary: everything looks good."
    description: "The summary text to post."
  ops_channel:
    type: string
    default: "#ops"
    description: "The ops channel to warn when the primary post fails."
steps:
  - id: notify
    description: Post summary to Slack, warn ops on failure
    type: try
    body:
      - id: post_summary
        description: Post the summary message to the configured Slack channel
        type: action
        uses: slack.post_message
        with:
          channel: "{{ input.channel }}"
          text: "{{ input.summary }}"
    catch:
      - id: warn_ops
        description: Warn the ops channel that the primary Slack notification failed
        type: action
        uses: slack.post_message
        with:
          channel: "{{ input.ops_channel }}"
          text: "{{ ':warning: Failed to post summary to ' & input.channel & ': ' & error.message }}"
outputs:
  status: "{{ $exists(steps.warn_ops.output) ? 'notification_failed' : 'ok' }}"
  posted_to: "{{ $exists(steps.warn_ops.output) ? input.ops_channel : steps.post_summary.output.channel }}"
---

Posts a summary message to a configurable Slack channel. If the Slack call fails for any reason, the workflow catches the error, posts a warning to the ops channel, and exits cleanly — the notification failure never crashes the workflow.

## Inputs

| Input | Default | Description |
|---|---|---|
| `channel` | `#general` | The Slack channel to post the summary to |
| `summary` | `"Workflow summary: everything looks good."` | The summary text to post |
| `ops_channel` | `#ops` | The fallback ops channel to warn on failure |

## Outputs

| Output | Description |
|---|---|
| `status` | `ok` if the primary post succeeded, `notification_failed` if the fallback was used |
| `posted_to` | The channel the final message was delivered to |

## How it works

1. **Try** — Posts `summary` to `channel` via `slack.post_message`.
2. **Catch** — If that fails for any reason, posts a `⚠️ Failed to post summary …` warning to `ops_channel` with the original error message.
3. Either way, the workflow completes successfully and reports what happened via its outputs.

## Setup

No special setup beyond a Slack integration with `chat:write` permission. Ensure both the target channel and the ops channel are accessible to the connected Slack app.
