---
name: workflow-author
description: Generate valid WorkflowSkill YAML from natural language descriptions. Teaches Claude Code to author executable workflow definitions.
---

# WorkflowSkill Author

Read `runtime/skill/SKILL.md` for the full authoring guide — it is the single source of truth for YAML structure, step types, expression language, iteration, design rules, and validation checklist.

## Available tools (CLI runtime)

When authoring workflows to run via `workflowskill run`, these tools are pre-registered:

### `web_fetch`

Fetches a URL and returns readable content.

| Input     | Type                     | Required | Default      | Description   |
| --------- | ------------------------ | -------- | ------------ | ------------- |
| `url`     | string                   | yes      | —            | URL to fetch  |
| `extract` | `'markdown'` \| `'text'` | no       | `'markdown'` | Output format |

Output fields: `content` (string), `title` (string, may be absent), `url` (string)

Example step:

```yaml
- id: fetch_page
  type: tool
  tool: web_fetch
  inputs:
    url:
      type: string
      value: $inputs.url
    extract:
      type: string
      value: markdown
  outputs:
    content:
      type: string
      value: $result.content
    title:
      type: string
      value: $result.title
```

### `llm`

Calls Claude and returns a parsed JSON object.

| Input    | Type   | Required | Default                    | Description                                          |
| -------- | ------ | -------- | -------------------------- | ---------------------------------------------------- |
| `prompt` | string | yes      | —                          | User prompt                                          |
| `system` | string | no       | —                          | System prompt                                        |
| `schema` | object | no       | —                          | JSON schema for the response shape (formatting hint) |
| `model`  | string | no       | `claude-sonnet-4-20250514` | Model ID                                             |

Output: a parsed JSON object — map specific fields via `$result.<field>` in step outputs.

Requires `ANTHROPIC_API_KEY` environment variable.

Example step:

```yaml
- id: extract
  type: tool
  tool: llm
  inputs:
    prompt:
      type: string
      value: "Extract the key facts from this article: ${steps.fetch_page.output.content}"
    schema:
      type: object
      value:
        title: string
        summary: string
        facts:
          type: array
          items:
            type: string
  outputs:
    summary:
      type: string
      value: $result.summary
    facts:
      type: array
      value: $result.facts
```
