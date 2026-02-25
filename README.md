# WorkflowSkill

A declarative workflow language for AI agents. Describe a task in YAML — the runtime handles parsing, validation, execution, error handling, and observability.

```yaml
workflow:
  steps:
    - id: fetch
      type: tool
      tool: http.request
      inputs:
        - name: url
          value: $inputs.endpoint
      outputs:
        - name: body

    - id: summarize
      type: llm
      prompt: "Summarize this content: $steps.fetch.output.body"
      outputs:
        - name: summary

    - id: done
      type: exit
      status: success
      output:
        value: $steps.summarize.output.summary
```

## Repositories

| Repo | Description |
|------|-------------|
| **workflowskill** (this repo) | Specification, proposal, and reference runtime |
| [openclaw-workflowskill](https://github.com/matthew-h-cromer/openclaw-workflowskill) | OpenClaw plugin — validate, run, and review workflows from the agent |

## Documentation

| Document | Description |
|----------|-------------|
| [SPEC.md](SPEC.md) | Full language specification — the source of truth for all behavior |
| [PROPOSAL.md](PROPOSAL.md) | Design rationale, requirements, and alternatives considered |
| [runtime/](runtime/) | Reference TypeScript implementation |

## Quick start

```bash
cd runtime
npm install
npm run build

# Validate a workflow
npx tsx src/cli/index.ts validate test/fixtures/echo.md

# Run a workflow
npx tsx src/cli/index.ts run test/fixtures/echo.md -i '{"message": "hello"}'

# Generate from natural language (requires ANTHROPIC_API_KEY)
npx tsx src/cli/index.ts generate "Triage my Gmail inbox and summarize unread messages"
```

## Language overview

WorkflowSkill workflows are YAML documents with five step types:

| Step type | Description |
|-----------|-------------|
| `tool` | Invoke an external tool (HTTP, Gmail, Sheets, or custom) |
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
- **Built-in tools** — `http.request`, `html.select`, Gmail, Google Sheets
- **Generator** — LLM-powered workflow generation from natural language
- **CLI** — `validate`, `run`, and `generate` commands
- **Run log** — structured observability output for every run

See [`runtime/`](runtime/) for setup, API docs, and development instructions.

## License

MIT
