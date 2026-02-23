# WorkflowSkill Examples

> **Related documents:** [Specification](SPEC.md) | [Proposal](PROPOSAL.md)

The [specification](SPEC.md) defines every piece of the WorkflowSkill format. This section puts them together into complete, runnable workflows. Each example is a `workflow` block that would appear inside a SKILL.md file.

## Example 1: Daily Email Triage

This is the email triage workflow referenced throughout the Problem Statement. It fetches unread emails, uses an LLM to score each one for importance, filters and sorts the results, and posts a briefing to Slack. One LLM step, using a cheap model. Everything else is deterministic.

Five of the seven steps consume zero tokens. The LLM step uses Haiku for simple classification work. Monthly cost: ~$0.09 instead of ~$4.50.

```yaml
```workflow
inputs:
  max_results:
    type: int
    default: 20
  min_score:
    type: int
    default: 7

outputs:
  important_count:
    type: int
    source: $steps.format_briefing.output.items.length
  emails:
    type: array
    source: $steps.format_briefing.output.items

steps:
  - id: fetch_emails
    type: tool
    description: Fetch unread emails from the last 24 hours
    tool: gmail.search
    inputs:
      query:
        type: string
        default: "is:unread newer_than:1d"
      max_results:
        type: int
        source: $inputs.max_results
    outputs:
      messages:
        type: array
        source: $output.messages
    retry:
      max: 3
      delay: "2s"
      backoff: 2.0

  - id: score_emails
    type: llm
    description: Score each email for importance and summarize
    model: haiku
    prompt: |
      Score this email from 1 to 10 for importance based on sender,
      subject, and urgency. Provide a one-sentence summary.

      From: $item.from
      Subject: $item.subject
      Body: $item.body

      Respond as JSON: { "from": "<sender>", "subject": "<subject>",
      "score": <1-10>, "summary": "<string>" }
    response_format:
      type: object
      properties:
        from: { type: string }
        subject: { type: string }
        score: { type: int }
        summary: { type: string }
    each: $steps.fetch_emails.output.messages
    inputs:
      email:
        type: object
        source: $item
    outputs:
      from: { type: string }
      subject: { type: string }
      score: { type: int }
      summary: { type: string }

  - id: filter_important
    type: transform
    description: Keep emails scoring at or above the threshold
    operation: filter
    where: $item.score >= $inputs.min_score
    inputs:
      items:
        type: array
        source: $steps.score_emails.output
    outputs:
      items: { type: array }

  - id: sort_by_score
    type: transform
    description: Sort by score, highest first
    operation: sort
    field: score
    direction: desc
    inputs:
      items:
        type: array
        source: $steps.filter_important.output.items
    outputs:
      items: { type: array }

  - id: exit_if_none
    type: exit
    description: Nothing important today
    condition: $steps.sort_by_score.output.items.length == 0
    status: success
    output:
      important_count: 0
      emails: []

  - id: format_briefing
    type: transform
    description: Shape the final output
    operation: map
    expression:
      from: $item.from
      subject: $item.subject
      score: $item.score
      summary: $item.summary
    inputs:
      items:
        type: array
        source: $steps.sort_by_score.output.items
    outputs:
      items: { type: array }

  - id: send_briefing
    type: tool
    description: Post the daily briefing to Slack
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#daily-briefing"
      blocks:
        type: array
        source: $steps.format_briefing.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore
```
```

| Step | Type | Tokens | Purpose |
|------|------|--------|---------|
| fetch_emails | tool | 0 | Fetch data from Gmail |
| score_emails | llm | ~300 x 20 | Score and summarize each email |
| filter_important | transform | 0 | Keep emails above threshold |
| sort_by_score | transform | 0 | Order by importance |
| exit_if_none | exit | 0 | Short-circuit if nothing matters |
| format_briefing | transform | 0 | Shape the output |
| send_briefing | tool | 0 | Deliver to Slack |

## Example 2: Deployment Report (Zero LLM Tokens)

Not every workflow needs an LLM. This one fetches recent deployments from GitHub, filters to production, sorts by time, and posts a summary to Slack. Every step is deterministic. Total token cost: zero.

This is the class of workflow (backups, aggregation, rule-based routing) that currently runs through a full LLM session for no reason.

```yaml
```workflow
inputs:
  repo:
    type: string
  hours:
    type: int
    default: 24

outputs:
  count:
    type: int
    source: $steps.format_report.output.items.length
  deployments:
    type: array
    source: $steps.format_report.output.items

steps:
  - id: fetch_deploys
    type: tool
    description: Get recent deployments
    tool: github.list_deployments
    inputs:
      repo:
        type: string
        source: $inputs.repo
      since:
        type: string
        default: "24h"
    outputs:
      deployments:
        type: array
        source: $output.deployments
    retry:
      max: 3
      delay: "5s"
      backoff: 2.0

  - id: filter_production
    type: transform
    description: Keep only production deployments
    operation: filter
    where: $item.environment == "production"
    inputs:
      items:
        type: array
        source: $steps.fetch_deploys.output.deployments
    outputs:
      items: { type: array }

  - id: exit_if_none
    type: exit
    description: Nothing deployed
    condition: $steps.filter_production.output.items.length == 0
    status: success
    output:
      count: 0
      deployments: []

  - id: sort_recent
    type: transform
    description: Most recent first
    operation: sort
    field: created_at
    direction: desc
    inputs:
      items:
        type: array
        source: $steps.filter_production.output.items
    outputs:
      items: { type: array }

  - id: format_report
    type: transform
    description: Extract the fields we care about
    operation: map
    expression:
      repo: $item.repository.name
      sha: $item.sha
      author: $item.creator.login
      status: $item.state
      deployed_at: $item.created_at
    inputs:
      items:
        type: array
        source: $steps.sort_recent.output.items
    outputs:
      items: { type: array }

  - id: post_to_slack
    type: tool
    description: Send the report
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#deployments"
      blocks:
        type: array
        source: $steps.format_report.output.items
    outputs:
      ok: { type: boolean }
```
```

Six steps. Zero tokens. The runtime executes this in a fraction of a second with no model calls. Compare that to an LLM reading a SKILL.md, reasoning about which GitHub API to call, interpreting the response, formatting a message, and deciding where to send it.

## Example 3: Content Moderation (Conditional Branching)

This workflow demonstrates the `conditional` step type for routing between different execution paths. New posts are evaluated against community guidelines. If any high-severity violations are found, those posts are removed automatically and moderators are notified. Otherwise, flagged posts are queued for human review.

```yaml
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
    then: [auto_remove, send_urgent_alert]
    else: [send_summary]

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
```

The conditional step at `route_by_severity` is the key. If any high-severity violations exist, the workflow auto-removes those posts and sends an urgent alert to moderators. If all violations are low-severity, moderators get a routine summary instead. The routing logic is declared and auditable, not improvised by the LLM at runtime.

The `queue_for_review` step sits outside the conditional. It uses a `condition` guard to check whether low-severity posts exist, and runs regardless of which branch the conditional took. This means low-severity posts are always queued for human review, whether or not high-severity posts were also found in the same batch.
