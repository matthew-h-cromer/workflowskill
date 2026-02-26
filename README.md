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

**Zero-config (no API key needed):**

```bash
workflowskill run examples/hello-world/hello-world.md
```

**Requires `ANTHROPIC_API_KEY`:**

```bash
# Generate a workflow from natural language
npx tsx src/cli/index.ts generate "Triage my Gmail inbox and summarize unread messages"
```

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
- **Generator** — LLM-powered workflow generation from natural language
- **CLI** — `validate`, `run`, and `generate` commands
- **Run log** — structured observability output for every run

See [`runtime/`](runtime/) for setup, API docs, and development instructions.

## License

[MIT](LICENSE)
