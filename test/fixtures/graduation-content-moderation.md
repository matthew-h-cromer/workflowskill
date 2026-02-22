---
name: content-moderation
description: RFC Example 3 - Content moderation with conditional branching
---

# Content Moderation

```workflow
inputs:
  channel_id:
    type: string

outputs:
  evaluated:
    type: int
    source: $steps.fetch_posts.output.posts.length
  auto_removed:
    type: int
    source: $steps.filter_high_severity.output.items.length
  queued_for_review:
    type: int
    source: $steps.filter_low_severity.output.items.length

steps:
  - id: fetch_posts
    type: tool
    description: Get new posts from the last hour
    tool: community.list_recent_posts
    inputs:
      channel_id:
        type: string
        source: $inputs.channel_id
      since:
        type: string
        default: "1h"
    outputs:
      posts: { type: array }

  - id: exit_if_none
    type: exit
    description: No new posts
    condition: $steps.fetch_posts.output.posts.length == 0
    status: success
    output:
      evaluated: 0
      auto_removed: 0
      queued_for_review: 0

  - id: evaluate_posts
    type: llm
    description: Check each post against community guidelines
    model: haiku
    prompt: |
      Evaluate this post against community guidelines.
      Flag violations for: harassment, spam, misinformation,
      illegal content.

      Post by $item.author: $item.body

      Respond as JSON: { "post_id": "<id>", "severity": "none|low|high",
      "reason": "<explanation or empty string>" }
    response_format:
      type: object
      properties:
        post_id: { type: string }
        severity: { type: string }
        reason: { type: string }
    each: $steps.fetch_posts.output.posts
    inputs:
      post:
        type: object
        source: $item
    outputs:
      post_id: { type: string }
      severity: { type: string }
      reason: { type: string }

  - id: filter_violations
    type: transform
    description: Keep only posts that were flagged
    operation: filter
    where: $item.severity != "none"
    inputs:
      items:
        type: array
        source: $steps.evaluate_posts.output
    outputs:
      items: { type: array }

  - id: exit_if_clean
    type: exit
    description: All posts are clean
    condition: $steps.filter_violations.output.items.length == 0
    status: success
    output:
      evaluated: $steps.fetch_posts.output.posts.length
      auto_removed: 0
      queued_for_review: 0

  - id: filter_high_severity
    type: transform
    operation: filter
    where: $item.severity == "high"
    inputs:
      items:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      items: { type: array }

  - id: filter_low_severity
    type: transform
    operation: filter
    where: $item.severity == "low"
    inputs:
      items:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      items: { type: array }

  - id: route_by_severity
    type: conditional
    description: Urgent alert vs. routine summary
    condition: $steps.filter_high_severity.output.items.length > 0
    inputs: {}
    outputs: {}
    then:
      - auto_remove
      - send_urgent_alert
    else:
      - send_summary

  - id: auto_remove
    type: tool
    description: Remove high-severity posts immediately
    tool: community.remove_posts
    each: $steps.filter_high_severity.output.items
    inputs:
      post_id:
        type: string
        source: $item.post_id
      reason:
        type: string
        source: $item.reason
    outputs:
      removed: { type: boolean }

  - id: send_urgent_alert
    type: tool
    description: Urgent alert to the moderation team
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#moderation-urgent"
      blocks:
        type: array
        source: $steps.filter_high_severity.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore

  - id: send_summary
    type: tool
    description: Routine summary when nothing critical
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#moderation-log"
      blocks:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore

  - id: queue_for_review
    type: tool
    description: Queue low-severity posts for human review
    condition: $steps.filter_low_severity.output.items.length > 0
    tool: community.queue_review
    each: $steps.filter_low_severity.output.items
    inputs:
      post_id:
        type: string
        source: $item.post_id
      reason:
        type: string
        source: $item.reason
    outputs:
      queued: { type: boolean }
```
