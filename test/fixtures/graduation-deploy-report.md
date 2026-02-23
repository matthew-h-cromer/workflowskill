---
name: deploy-report
description: RFC Example 2 - Deployment report with zero LLM tokens
---

# Deployment Report

```workflow
inputs:
  repo:
    type: string
  hours:
    type: int
    value: 24

outputs:
  count:
    type: int
    value: $steps.format_report.output.items.length
  deployments:
    type: array
    value: $steps.format_report.output.items

steps:
  - id: fetch_deploys
    type: tool
    description: Get recent deployments
    tool: github.list_deployments
    inputs:
      repo:
        type: string
        value: $inputs.repo
      since:
        type: string
        value: "24h"
    outputs:
      deployments: { type: array }
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
        value: $steps.fetch_deploys.output.deployments
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
        value: $steps.filter_production.output.items
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
        value: $steps.sort_recent.output.items
    outputs:
      items: { type: array }

  - id: post_to_slack
    type: tool
    description: Send the report
    tool: slack.post_message
    inputs:
      channel:
        type: string
        value: "#deployments"
      blocks:
        type: array
        value: $steps.format_report.output.items
    outputs:
      ok: { type: boolean }
```
