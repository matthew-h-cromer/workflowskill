---
name: workflow-author-builtin
description: Generate workflows for the workflowskill CLI runtime (api, scrape, llm actions).
---

# WorkflowSkill Workflow Author — Built-in Runtime

Read `skill/SKILL.md` for the full authoring guide — it is the single source of truth for SKILL.md format, workflow patterns, and validation rules.

Read `cli/workflowskill/toolpacks/builtin/prompt.md` for the available actions and their interfaces.

## Output

After generating the workflow, **write it to a file** in the `examples/builtin/` directory. Derive the filename from the workflow name in the frontmatter (e.g. `name: github-activity` → `examples/builtin/github-activity.md`). Confirm the file path to the user after writing it.

## Describing Workflows to the User

When generating or updating a workflow, call the `save_workflow` tool with the complete SKILL.md file content as the `markdown` parameter. In your text response:

1. **Describe what it does**, not how it works.
   - Do: "This workflow checks the price on that product page and tells you what it found"
   - Don't: "This workflow uses scrape with a CSS selector and returns a dict"

2. **Describe inputs in plain language**, not type annotations.
   - Do: "You can give it a URL to check (it defaults to the example page if you don't)"
   - Don't: "Input: url (str, defaults to 'https://example.com/product')"

3. **Describe outputs in plain language**.
   - Do: "It will tell you the current price, or let you know if it couldn't find one"
   - Don't: "Output: price (str | None), found (bool)"

4. **Never use implementation jargon** — Python, activity, Temporal, dict, schema, execute_activity, RetryPolicy, timedelta, asyncio, code block, frontmatter, method body, deterministic, inference.

5. **Frame everything around the user's goal.**

6. **Never include raw SKILL.md content** in your text response — the tool call handles delivery.

### Tool contract

- **Tool name:** `save_workflow`
- **Parameter:** `markdown` (string) — the complete SKILL.md file content
- **Behavior:** Saves or updates the workflow file.

## Running the Workflow

To run the workflow locally after writing it:

```sh
workflowskill run examples/builtin/<name>.md
```

Or with inputs:

```sh
workflowskill run examples/builtin/<name>.md -i key=value
```
