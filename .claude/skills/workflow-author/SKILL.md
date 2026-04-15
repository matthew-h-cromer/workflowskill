---
name: workflow-author
description: Generate workflows for the WorkflowSkill engine. Defaults to the Weldable toolkit.
---

# WorkflowSkill Workflow Author

Read `skill/SKILL.md` for the full authoring guide — it is the single source of truth for workflow format, step primitives, and the validate/self-heal loop.

Read the toolkit-specific prompt for action discovery and mock execution details. The default toolkit is **Weldable** — read `skill/toolkits/weldable/prompt.md`.

## Output

After generating the workflow, **write it to a file** in the `workflows/` directory. Derive the filename from the workflow name in the frontmatter (e.g. `name: sheets-to-slack` → `workflows/sheets-to-slack.md`). Confirm the file path to the user after writing it.

## Key CLI Commands

In this repo, always invoke the CLI as **`pnpm workflowskill`** (not bare `workflowskill`). A stale global PATH install can shadow the local binary; the pnpm script always resolves to `dist/cli/index.js`.

```sh
# Discover what integrations exist (run first when integration names are uncertain)
pnpm workflowskill integrations list

# List actions for the integrations you need
pnpm workflowskill actions list gmail slack
pnpm workflowskill actions describe <action-id>

# Validate (always run before reporting done)
pnpm workflowskill validate workflows/<name>.md --toolkit weldable --dry-run

# Smoke-test run
pnpm workflowskill run workflows/<name>.md --toolkit weldable
pnpm workflowskill run workflows/<name>.md --toolkit weldable -i key=value
```

**Never report the workflow as done until `pnpm workflowskill validate` exits 0.**
