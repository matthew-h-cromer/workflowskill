---
name: workflow-author
description: Generate workflows for the WorkflowSkill engine. Defaults to the Weldable toolkit.
---

# WorkflowSkill Workflow Author

Read `skill/SKILL.md` for the full authoring guide — it is the single source of truth for SKILL.md format, workflow patterns, and validation rules.

Read the toolkit-specific prompt for action routing, authentication, and action discovery. The default toolkit is **Weldable** — read `cli/workflowskill/toolkits/weldable/prompt.md`.

## Output

After generating the workflow, **write it to a file** in the `workflows/` directory. Derive the filename from the workflow name in the frontmatter (e.g. `name: sheets-to-slack` → `workflows/sheets-to-slack.md`). Confirm the file path to the user after writing it.

## Describing Workflows to the User

When generating or updating a workflow, call the `save_workflow` tool with the complete SKILL.md file content as the `markdown` parameter. In your text response:

1. **Describe what it does**, not how it works.
2. **Describe inputs in plain language**, not type annotations.
3. **Describe outputs in plain language**.
4. **Never use implementation jargon** — Python, activity, Temporal, dict, schema, execute_activity, RetryPolicy, timedelta, asyncio, code block, frontmatter, method body, deterministic, inference.
5. **Frame everything around the user's goal.**
6. **Never include raw SKILL.md content** in your text response — the tool call handles delivery.

### Tool contract

- **Tool name:** `save_workflow`
- **Parameter:** `markdown` (string) — the complete SKILL.md file content
- **Behavior:** Saves or updates the workflow file.

## Running the Workflow

```sh
workflowskill run workflows/<name>.md --toolkit <toolkit>
workflowskill run workflows/<name>.md --toolkit <toolkit> -i key=value
```
