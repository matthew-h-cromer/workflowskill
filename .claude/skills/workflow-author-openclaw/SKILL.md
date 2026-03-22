---
name: workflow-author-openclaw
description: Generate workflows targeting the OpenClaw agent platform (exec, browser, web_search, web_fetch, llm_task, read, write, edit).
---

# WorkflowSkill Workflow Author — OpenClaw

Read `skill/SKILL.md` for the full authoring guide — it is the single source of truth for SKILL.md format, workflow patterns, and validation rules.

Read `cli/workflowskill/toolpacks/openclaw/prompt.md` for the available OpenClaw actions and their exact interfaces.

## Target Environment

You are generating a workflow for the **OpenClaw** agent platform. The available actions mirror OpenClaw's native tools exactly. When the workflow runs in production, these actions are executed by OpenClaw's own runtime. When testing locally with `workflowskill run --toolpack openclaw`, they are executed by equivalent Python implementations.

## Output

After generating the workflow, **write it to a file** in the `workflows/` directory. Derive the filename from the workflow name in the frontmatter (e.g. `name: search-and-summarize` → `workflows/search-and-summarize.md`). Confirm the file path and the local test command to the user after writing it.

## Describing Workflows to the User

When generating or updating a workflow, call the `save_workflow` tool with the complete SKILL.md file content as the `markdown` parameter. In your text response:

1. **Describe what it does**, not how it works.
2. **Describe inputs in plain language**, not type annotations.
3. **Describe outputs in plain language**.
4. **Never use implementation jargon** — Python, activity, Temporal, dict, schema, execute_activity, RetryPolicy, timedelta, asyncio, code block, frontmatter, method body.
5. **Frame everything around the user's goal.**
6. **Never include raw SKILL.md content** in your text response — the tool call handles delivery.

### Tool contract

- **Tool name:** `save_workflow`
- **Parameter:** `markdown` (string) — the complete SKILL.md file content
- **Behavior:** Saves or updates the workflow file.

## Testing Actions

Before assembling a workflow, test each action in isolation to verify response structures and field names.

The browser **persists across CLI calls** — Chrome stays alive after each command returns, so you can do multi-step testing as separate invocations:

```sh
# Test web search
workflowskill openclaw_action web_search '{"query": "example query", "count": 3}'

# Test fetching a URL
workflowskill openclaw_action web_fetch '{"url": "https://example.com"}'

# Test a shell command
workflowskill openclaw_action exec '{"command": "echo hello"}'

# Browser: navigate (Chrome opens and stays open)
workflowskill openclaw_action browser '{"action": "navigate", "url": "https://example.com"}'

# Browser: snapshot the page (connects to the same Chrome, same tab)
workflowskill openclaw_action browser '{"action": "snapshot"}'

# Browser: click something, type, etc.
workflowskill openclaw_action browser '{"action": "click", "ref": "e3"}'
workflowskill openclaw_action browser '{"action": "type", "ref": "e5", "text": "hello"}'
```

**Important browser testing notes:**
- Always run `snapshot` before `click`/`type` — refs (`e1`, `e2`, ...) are rebuilt on each snapshot call and don't persist across processes.
- If a login wall appears, the user can log in manually in the open browser window, then continue with the next command.
- Chrome defaults to visible (not headless). Set `BROWSER_HEADLESS=true` to run headless.
- To close Chrome between sessions: close the window or run `pkill -f "remote-debugging-port=9222"`.

Inspect each result to learn exact field names before wiring steps together. If an action returns an error or unexpected structure, stop and surface the problem to the user before writing any workflow code.

## Testing Locally

After writing the workflow, show the user how to test it:

```sh
# Install OpenClaw extras (first time only)
uv sync --extra openclaw
uv run playwright install chromium  # only if the workflow uses the browser action

# Run the workflow
workflowskill run workflows/<name>.md --toolpack openclaw

# With inputs
workflowskill run workflows/<name>.md --toolpack openclaw -i query="your search"
```

Required environment variables:
- `ANTHROPIC_API_KEY` — required if the workflow uses `llm_task`
- `BRAVE_API_KEY` — required if the workflow uses `web_search`
