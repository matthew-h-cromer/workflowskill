---
version: 1
name: post-slack-message
description: "Post a custom message to any Slack channel you choose — perfect for one-off announcements, alerts, or team updates."
inputs:
  channel:
    type: string
    description: "Channel name or ID to post to (e.g. #general)"
  text:
    type: string
    description: "The message text to post (supports Slack mrkdwn formatting)"
outputs:
  ts: "{{ steps.post.output.ts }}"
  channel: "{{ steps.post.output.channel }}"
steps:
  - id: post
    description: Post the message to the specified Slack channel
    type: action
    uses: slack.post_message
    with:
      channel: "{{ input.channel }}"
      text: "{{ input.text }}"
---

Posts a message to a Slack channel using two workflow inputs: the **channel** (name or ID) and the **text** to send. The workflow returns the message timestamp (`ts`) and the channel ID it was posted to, which can be used downstream to reply, react, or reference the message.

**Inputs**
| Name | Type | Description |
|---|---|---|
| `channel` | string | Channel name (e.g. `#general`) or channel ID |
| `text` | string | Message body — supports Slack mrkdwn formatting |

**Outputs**
| Name | Description |
|---|---|
| `ts` | Timestamp of the posted message |
| `channel` | Channel ID the message was posted to |

No manual setup is required beyond having a connected Slack integration.
