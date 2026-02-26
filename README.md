# WorkflowSkill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)

A declarative workflow language for AI agents. Describe a task in YAML — the runtime handles parsing, validation, execution, error handling, and observability.

> **Status:** Early-stage specification and reference implementation.

```yaml
inputs:
  endpoint:
    type: string

outputs:
  summary:
    type: string
    value: $steps.summarize.output.summary

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        value: $inputs.endpoint
    outputs:
      body:
        type: string

  - id: summarize
    type: llm
    prompt: "Summarize this content: $steps.fetch.output.body"
    outputs:
      summary:
        type: string
        value: $result
```

## Repositories

| Repo | Description |
|------|-------------|
| **workflowskill** (this repo) | Specification, proposal, and reference runtime |
| [openclaw-workflowskill](https://github.com/matthew-h-cromer/openclaw-workflowskill) | OpenClaw plugin — validate, run, and review workflows from the agent |

## Documentation

| Document | Description |
|----------|-------------|
| [PROPOSAL.md](PROPOSAL.md) | Design rationale, requirements, and alternatives considered |
| [SPEC.md](SPEC.md) | Full language specification — the source of truth for all behavior |
| [examples/](examples/) | Runnable workflow examples |
| [runtime/](runtime/) | Reference TypeScript implementation |

## Quick start

```bash
cd runtime
npm install
```

**Validate and run a workflow (no API key needed):**

```bash
workflowskill validate ../examples/hello-world/hello-world.md
workflowskill run ../examples/hello-world/hello-world.md
```

**Generate a workflow with Claude Code:**

The intended way to test the runtime is to generate workflows with Claude Code and run them. Open this repo in Claude Code — it has web access, file I/O, and can invoke the CLI, so it can take a task description all the way from research to a validated, runnable workflow.

Use the workflow-author skill:

```
/workflow-author fetch the top 10 Hacker News stories and return their titles, scores, and URLs
```

Claude will research the task, propose a design, write the SKILL.md, and validate it with the CLI. The built-in tools available to generated workflows are:

| Tool | What it does | Needs credentials |
|------|--------------|-------------------|
| `http.request` | HTTP GET/POST/PUT/PATCH/DELETE | No |
| `html.select` | CSS selector extraction from HTML | No |
| `gmail.search` | Search Gmail by query | Google OAuth2 |
| `gmail.read` | Read a Gmail message by ID | Google OAuth2 |
| `gmail.send` | Send email via Gmail | Google OAuth2 |
| `sheets.read` | Read a Google Sheets range | Google OAuth2 |
| `sheets.write` | Write to a Google Sheets range | Google OAuth2 |
| `sheets.append` | Append rows to a Google Sheets range | Google OAuth2 |

`http.request` and `html.select` work with no setup. For Google tools, add credentials to `runtime/.env` (see `runtime/.env.example`).

## Language overview

WorkflowSkill workflows are YAML documents with five step types:

| Step type | Description |
|-----------|-------------|
| `tool` | Invoke an MCP server endpoint, built-in tool (HTTP, Gmail, Sheets), or any registered function |
| `llm` | Call a language model with a templated prompt |
| `transform` | Filter, map, or sort data without side effects |
| `conditional` | Branch execution based on an expression |
| `exit` | Terminate early with a status and output |

Steps are connected by `$steps.<id>.output.<field>` references. Loops use `each`. Error handling uses `on_error: fail | ignore | retry`.

See [SPEC.md](SPEC.md) for the full language reference.

## Runtime

The reference implementation is a standalone TypeScript library and CLI in [`runtime/`](runtime/). It includes:

- **Parser** — extracts and validates workflow YAML from Markdown
- **Expression engine** — `$`-reference language with `${...}` template interpolation
- **Validator** — pre-execution DAG and type checking
- **Executor** — five step type executors
- **Built-in tools** — `http.request`, `html.select`, Gmail, Google Sheets (MCP server endpoints and custom functions also supported)
- **CLI** — `validate` and `run` commands
- **Run log** — structured observability output for every run

## Library API

```typescript
import {
  parseWorkflowFromMd,
  validateWorkflow,
  runWorkflow,
  MockToolAdapter,
  MockLLMAdapter,
} from "workflowskill";

const workflow = parseWorkflowFromMd(markdownContent);
const validation = validateWorkflow(workflow, toolAdapter);

const runLog = await runWorkflow({
  workflow,
  inputs: { message: "hello" },
  toolAdapter, // implements ToolAdapter
  llmAdapter,  // implements LLMAdapter
});
```

## Adapters

`ToolAdapter` and `LLMAdapter` are the integration boundaries. Mock implementations are provided for testing.

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];
}

interface LLMAdapter {
  call(
    model: string | undefined,
    prompt: string,
    responseFormat?: Record<string, unknown>,
  ): Promise<LLMResult>;
}
```

## Development

All commands run from `runtime/`:

```bash
npm run typecheck          # tsc --noEmit
npm run test               # Run all tests (vitest)
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # tsdown
npm run validate:examples  # Validate all fixtures
```

## Configuration

Create a `.env` file in `runtime/`:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for LLM steps in workflows
GOOGLE_CLIENT_ID=...               # Required for Gmail and Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

The runtime degrades gracefully: missing `ANTHROPIC_API_KEY` → mock LLM adapter with a warning. Missing Google credentials → Google tools not registered (warning if a workflow references them).

## License

[MIT](LICENSE)
