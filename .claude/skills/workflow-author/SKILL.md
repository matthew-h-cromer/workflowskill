---
name: workflow-author
description: Dispatch to the right workflow authoring skill for the target ecosystem.
---

# Workflow Author — Dispatcher

This skill routes you to the right authoring environment based on the target ecosystem.

Ask the user which ecosystem they're building for, then invoke the appropriate skill:

- **`/workflow-author-builtin`** — workflows that run with `workflowskill run` (built-in actions: `api`, `scrape`, `llm`)
- **`/workflow-author-openclaw`** — workflows targeting the **OpenClaw** agent platform (actions: `exec`, `browser`, `web_search`, `web_fetch`, `llm_task`, `read`, `write`, `edit`). Test locally with `workflowskill run --toolpack openclaw`

If the user's message already makes the ecosystem clear (e.g. they mention OpenClaw, or they describe a task that requires browser automation or shell commands), invoke the appropriate skill immediately without asking.
