---
name: workflow-author
description: Generate valid WorkflowSkill YAML from natural language descriptions. Teaches Claude Code to author executable workflow definitions.
---

# WorkflowSkill Author

Read `runtime/skill/SKILL.md` for the full authoring guide — it is the single source of truth for workflow authoring rules, YAML structure, step type reference, expression language, iteration patterns, and validation checklist.

## Tools Available in This Environment

In the local Claude Code environment, the following tools are available for use in `tool` steps:

- `WebFetch` — fetch a URL and return the content
- `WebSearch` — search the web and return results
- `Read` — read a file from the local filesystem
- `Write` — write a file to the local filesystem
- `Edit` — make targeted edits to an existing file
- `Bash` — run shell commands
- `Glob` — find files by glob pattern
- `Grep` — search file contents with regex

Always confirm available tools with the user before writing `tool` steps — tool names depend on what the host runtime registers.

## Dev Workflow

**Validate a workflow** using the runtime API:

```typescript
import { validateWorkflowSkill } from 'workflowskill';
const result = validateWorkflowSkill(skillMdContent);
// result.valid, result.errors
```

**Run a workflow** using the runtime API:

```typescript
import { runWorkflowSkill } from 'workflowskill';
const result = await runWorkflowSkill(skillMdContent, inputs, adapter);
```

**Run the test suite** (from `runtime/`):

```sh
npm run test
```
