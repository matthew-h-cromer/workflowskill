# WorkflowSkill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/matthew-h-cromer/workflowskill/issues)

A declarative workflow language for AI agents. Describe a task in YAML — the runtime handles parsing, validation, execution, error handling, and observability.

> [!IMPORTANT]
> **Pre-release.** The spec and reference runtime are complete and tested, but the API is not yet frozen. This is a good time to influence direction — open an issue if something feels wrong, missing, or over-engineered.

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
npm run build
```

**hello-world** — no API keys needed:

```bash
workflowskill run ../examples/hello-world.md
```

**fetch-job-postings** — scrapes LinkedIn job listings, no API keys needed:

```bash
workflowskill run ../examples/fetch-job-postings.md \
  --input '{"keywords": "software engineer", "location": "United States"}'
```

**hello-world-gmail** — sends an email via Gmail (requires Google credentials in `runtime/.env`, see [Getting Google OAuth2 credentials](#getting-google-oauth2-credentials)):

```bash
workflowskill run ../examples/hello-world-gmail.md \
  --input '{"to": "you@example.com"}'
```

**Generate a workflow with Claude Code:**

The intended way to test the runtime is to generate workflows with Claude Code and run them. Open this repo in Claude Code — it has web access, file I/O, and can invoke the CLI, so it can take a task description all the way from research to a validated, runnable workflow.

Use the workflow-author skill:

```
/workflow-author fetch the top 10 Hacker News stories and return their titles, scores, and URLs
```

Claude will research the task, propose a design, write the SKILL.md, and validate it with the CLI. The dev tools available to generated workflows are:

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
| `tool` | Invoke an MCP server endpoint, dev tool (HTTP, Gmail, Sheets), or any registered function |
| `llm` | Call a language model with a templated prompt |
| `transform` | Filter, map, or sort data without side effects |
| `conditional` | Branch execution based on an expression |
| `exit` | Terminate early with a status and output |

Steps are connected by `$steps.<id>.output.<field>` references. Loops use `each`. Error handling uses `on_error: fail | ignore` (retries are a separate `retry:` field).

See [SPEC.md](SPEC.md) for the full language reference.

## Runtime

The reference implementation is a standalone TypeScript library and CLI in [`runtime/`](runtime/). It includes:

- **Parser** — extracts and validates workflow YAML from Markdown
- **Expression engine** — `$`-reference language with `${...}` template interpolation
- **Validator** — pre-execution DAG and type checking
- **Executor** — five step type executors
- **Dev tools** — `http.request`, `html.select`, Gmail, Google Sheets (for local workflow authoring; in production, wire your own `ToolAdapter`)
- **CLI** — `validate` and `run` commands
- **Run log** — structured observability output for every run

## Library API

Two entry points collapse parse → validate → run into single calls that accept raw content and never throw.

```typescript
import {
  runWorkflowSkill,
  validateWorkflowSkill,
} from "workflowskill";

// Validate a workflow (synchronous, never throws)
const result = validateWorkflowSkill({
  content,          // SKILL.md with frontmatter or bare workflow YAML
  toolAdapter,      // optional — skips tool availability checks if absent
});

if (!result.valid) {
  console.error(result.errors);
}

// Run a workflow (async, never throws — always returns a RunLog)
const log = await runWorkflowSkill({
  content,          // SKILL.md with frontmatter or bare workflow YAML
  inputs: { ... },
  toolAdapter,      // implements ToolAdapter
  llmAdapter,       // implements LLMAdapter
});

if (log.status === "success") {
  console.log(log.outputs);
}
```

Key ergonomic properties:
- **Accepts raw content** — SKILL.md with frontmatter or bare workflow YAML, no parsing step needed
- **Never throws** — parse, validation, and execution failures are encoded in the return value
- **`RunLog` is always returned**, with `error?: { phase, message, details }` on failure

## Adapters

`ToolAdapter` and `LLMAdapter` are the integration boundaries:

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

Built-in implementations:
- **`DevToolAdapter`** — provides `http.request`, `html.select`, Gmail, and Google Sheets tools for standalone use
- **`AnthropicLLMAdapter`** — wraps the Anthropic SDK; reads `ANTHROPIC_API_KEY` from the environment

For testing, **`MockToolAdapter`** and **`MockLLMAdapter`** let you supply handler functions without any external dependencies.

## Run log

Every call to `runWorkflowSkill` returns a `RunLog`:

```typescript
interface RunLog {
  id: string;
  workflow: string;
  status: "success" | "failed";
  summary: {
    steps_executed: number;
    steps_skipped: number;
    total_tokens: number;
    total_duration_ms: number;
  };
  started_at: string;           // ISO 8601
  completed_at: string;         // ISO 8601
  duration_ms: number;
  inputs: Record<string, unknown>;
  steps: StepRecord[];
  outputs: Record<string, unknown>;
  error?: {
    phase: "parse" | "validate" | "execute";
    message: string;
    details?: unknown;
  };
}
```

`error` is present only when the run failed. `outputs` is populated on success (and on `exit` steps with `status: failed`).

## Low-level API

`parseWorkflowFromMd`, `validateWorkflow`, and `runWorkflow` are still exported for consumers who need fine-grained control over each phase.

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

### Getting Google OAuth2 credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the APIs you need: **Gmail API** and/or **Google Sheets API** under *APIs & Services > Library*.
3. Go to *APIs & Services > OAuth consent screen*. Choose **External** and fill in the app name and your email.
4. Go to *APIs & Services > Credentials > Create Credentials > OAuth client ID*. Choose **Desktop app**. Copy the **Client ID** and **Client Secret** into your `.env`.
5. Get a refresh token. The easiest way is [Google's OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   - Click the gear icon, check **Use your own OAuth credentials**, and enter your Client ID and Client Secret.
   - In the left panel, select the scopes you need: `https://www.googleapis.com/auth/gmail.modify` (under **Gmail API v1**) and/or `https://www.googleapis.com/auth/spreadsheets` (under **Sheets API v4**). Click **Authorize APIs** and sign in.
   - Click **Exchange authorization code for tokens**. Copy the **Refresh token** into your `.env`.

## License

[MIT](LICENSE)
