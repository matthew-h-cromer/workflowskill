# WorkflowSkill

[![npm](https://img.shields.io/npm/v/workflowskill.svg)](https://www.npmjs.com/package/workflowskill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/matthew-h-cromer/workflowskill/blob/main/LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/matthew-h-cromer/workflowskill/issues)

> [!IMPORTANT]
> **Pre-release.** The spec and reference runtime are complete and tested, but the API is not yet frozen. This is a good time to influence direction — open an issue if something feels wrong, missing, or over-engineered.

A declarative workflow language for AI agents.

1. You prompt what you need: "I want to check this website daily"
2. Your agent writes a WorkflowSkill — an extension to [Agent Skills](https://agentskills.io/home) — that can be executed deterministically by any compatible runtime.
3. The WorkflowSkill runs reliably and cheaply for repetitive tasks — no agent needed.

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

## Install

```bash
npm install workflowskill
```

## CLI

```bash
# Validate a workflow (no API keys needed)
workflowskill validate path/to/workflow.md

# Run a workflow
workflowskill run path/to/workflow.md

# Pass inputs as JSON
workflowskill run path/to/workflow.md --input '{"keywords": "rust developer"}'
```

The CLI shows live progress on stderr and writes a structured [run log](#run-log) as JSON to stdout and to `runs/<name>-<timestamp>.json`.

## Authoring

A WorkflowSkill is authored via natural conversation with any agent system that supports the [Agent Skills](https://agentskills.io/home) format.

1. Prompt your agent to create a workflow: "I want to check this website daily"
   - For Claude Code, this package ships `skill/SKILL.md` which teaches it to author valid WorkflowSkill YAML. For other agent tools, provide the contents of `node_modules/workflowskill/skill/SKILL.md` as context.
2. Your agent writes a WorkflowSkill.
3. Run it deterministically: `workflowskill run <workflow.md>`

Your agent will research the task, write the workflow file, and validate it with the CLI. The dev tools available to generated workflows are:

| Tool            | What it does                          | Needs credentials |
| --------------- | ------------------------------------- | ----------------- |
| `http.request`  | HTTP GET/POST/PUT/PATCH/DELETE        | No                |
| `html.select`   | CSS selector extraction from HTML     | No                |
| `gmail.search`  | Search Gmail by query                 | Google OAuth2     |
| `gmail.read`    | Read a Gmail message by ID            | Google OAuth2     |
| `gmail.send`    | Send email via Gmail                  | Google OAuth2     |
| `sheets.read`   | Read a Google Sheets range            | Google OAuth2     |
| `sheets.write`  | Write to a Google Sheets range        | Google OAuth2     |
| `sheets.append` | Append rows to a Google Sheets range  | Google OAuth2     |

`http.request` and `html.select` work with no setup. For Google tools, add credentials to `.env` (see [Configuration](#configuration)).

**Evaluate the output:** Check `status` for overall success. If a step failed, its `error` field explains why. For `each` steps, `iterations` shows per-item results. Compare per-step `inputs` and `output` values against your expectations to find where the data flow broke down.

## Language overview

WorkflowSkill workflows are YAML documents with five step types:

| Step type     | Description                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| `tool`        | Invoke an MCP server endpoint, dev tool (HTTP, Gmail, Sheets), or any registered function |
| `llm`         | Call a language model with a templated prompt                                              |
| `transform`   | Filter, map, or sort data without side effects                                             |
| `conditional` | Branch execution based on an expression                                                    |
| `exit`        | Terminate early with a status and output                                                   |

Steps are connected by `$steps.<id>.output.<field>` references. Loops use `each`. Error handling uses `on_error: fail | ignore` (retries are a separate `retry:` field).

See the [full language specification](https://github.com/matthew-h-cromer/workflowskill/blob/main/SPEC.md) for details.

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
  started_at: string; // ISO 8601
  completed_at: string; // ISO 8601
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

## Configuration

Create a `.env` file in your project directory (or export env vars in your shell):

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for LLM steps in workflows
GOOGLE_CLIENT_ID=...               # Required for Gmail and Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

Missing `ANTHROPIC_API_KEY` causes LLM steps to fail with a clear error (no silent fallback). Missing Google credentials → Google tools not registered (warning if a workflow references them).

### Getting Google OAuth2 credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the APIs you need: **Gmail API** and/or **Google Sheets API** under _APIs & Services > Library_.
3. Go to _APIs & Services > OAuth consent screen_. Choose **External** and fill in the app name and your email.
4. Go to _APIs & Services > Credentials > Create Credentials > OAuth client ID_. Choose **Desktop app**. Copy the **Client ID** and **Client Secret** into your `.env`.
5. Get a refresh token. The easiest way is [Google's OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   - Click the gear icon, check **Use your own OAuth credentials**, and enter your Client ID and Client Secret.
   - In the left panel, select the scopes you need: `https://www.googleapis.com/auth/gmail.modify` (under **Gmail API v1**) and/or `https://www.googleapis.com/auth/spreadsheets` (under **Sheets API v4**). Click **Authorize APIs** and sign in.
   - Click **Exchange authorization code for tokens**. Copy the **Refresh token** into your `.env`.

## Documentation

Full specification, design rationale, and examples: [github.com/matthew-h-cromer/workflowskill](https://github.com/matthew-h-cromer/workflowskill)

## License

[MIT](https://github.com/matthew-h-cromer/workflowskill/blob/main/LICENSE)
