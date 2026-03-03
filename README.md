# WorkflowSkill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/matthew-h-cromer/workflowskill/issues)

> [!IMPORTANT]
> **Pre-release.** The spec and reference runtime are complete and tested, but the API is not yet frozen. This is a good time to influence direction — open an issue if something feels wrong, missing, or over-engineered.

A declarative workflow language for AI agents.

1. You prompt what you need: "I want to check this website daily"
2. Your agent writes a WorkflowSkill — an extension to [Agent Skills](https://agentskills.io/home) — that can be executed deterministically by any compatible runtime.
3. The WorkflowSkill runs reliably and cheaply for repetitive tasks — no agent needed.

## What it looks like

> **You:** I want to check Hacker News for AI stories every morning and email me a summary.
>
> **Agent:** I'll author a WorkflowSkill for that. _(invokes `/workflowskill-author`, writes a SKILL.md, runs `workflowskill_validate`)_
>
> Validated — 3 steps: `fetch`, `filter`, `email`. Running a test now... _(invokes `workflowskill_run`)_
>
> Run complete: 4 AI stories found, summary drafted. Ready to schedule — want me to set up a daily cron at 8 AM?

## Repositories

| Repo                                                                                 | Description                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **workflowskill** (this repo)                                                        | Specification, proposal, and reference runtime                       |
| [openclaw-workflowskill](https://github.com/matthew-h-cromer/openclaw-workflowskill) | OpenClaw plugin — validate, run, and review workflows from the agent |

## Documentation

| Document                   | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| [PROPOSAL.md](PROPOSAL.md) | Design rationale, requirements, and alternatives considered        |
| [SPEC.md](SPEC.md)         | Full language specification — the source of truth for all behavior |
| [examples/](examples/)     | Runnable workflow examples                                         |
| [runtime/](runtime/)       | Reference TypeScript implementation                                |
| [cli/](cli/)               | CLI tool — run workflow files from the command line                |

## Quick start

```bash
cd cli
npm install
npm run build
npm link            # makes `workflowskill` available globally

workflowskill run examples/hello-world.md
```

## CLI

```
Usage: workflowskill run <file> [options]

Options:
  -i, --input key=value   Set a workflow input (repeatable)
  --json-input '{...}'    Set all inputs as a JSON object
  --output-json           Print the full RunLog as JSON to stdout
  -h, --help              Show this help message
```

The CLI ships two built-in tools:

| Tool        | Description                                                    | Requires            |
| ----------- | -------------------------------------------------------------- | ------------------- |
| `web_fetch` | Fetch a URL, return readable content as markdown or plain text | —                   |
| `llm`       | Call Claude, return a parsed JSON object                       | `ANTHROPIC_API_KEY` |

Dev mode (no build step):

```bash
cd cli
npx tsx src/cli.ts run <file>
```

### Authoring WorkflowSkills

A WorkflowSkill is authored via natural conversation with any agent system that supports the [Agent Skills](https://agentskills.io/home) format.

1. Prompt your agent to create a workflow: "I want to check this website daily"
   - This repo is configured to work with Claude Code via `.claude/` — for other agent tools, provide the contents of `runtime/skill/SKILL.md` as context.
2. Your agent writes a WorkflowSkill.
3. Integrate it with your host using the [Integration](#integration) section.

**Evaluate the output:** Check `status` for overall success. If a step failed, its `error` field explains why. For `each` steps, `iterations` shows per-item results. Compare per-step `inputs` and `output` values against your expectations to find where the data flow broke down.

## Language overview

WorkflowSkill workflows are YAML documents with four step types:

| Step type     | Description                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `tool`        | Invoke any tool via the host's `ToolAdapter` (APIs, functions, LLM calls, etc.) |
| `transform`   | Filter, map, or sort data without side effects                                  |
| `conditional` | Branch execution based on an expression                                         |
| `exit`        | Terminate early with a status and output                                        |

All external calls — including LLM inference — go through `tool` steps. The runtime itself has no LLM dependency. The host registers whatever tools are available in the deployment context.

Steps are connected by `$steps.<id>.output.<field>` references. Loops use `each`. Error handling uses `on_error: fail | ignore` (retries are a separate `retry:` field).

See [SPEC.md](SPEC.md) for the full language reference.

## Runtime

The reference implementation is a standalone TypeScript library in [`runtime/`](runtime/). It includes:

- **Parser** — extracts and validates workflow YAML from Markdown
- **Expression engine** — `$`-reference language with `${...}` template interpolation
- **Validator** — pre-execution DAG and type checking
- **Executor** — four step type executors
- **Run log** — structured observability output for every run

The runtime is a pure orchestration library — no CLI, no built-in tools, no LLM dependencies. Wire in your tools and run.

## Integration

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

`ToolAdapter` is the integration boundary between the runtime and the host:

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];
}
```

Implement `ToolAdapter` to expose your tools (MCP servers, functions, LLM calls, etc.) to the workflow runtime.

For testing, **`MockToolAdapter`** lets you supply handler functions without any external dependencies:

```typescript
import { MockToolAdapter } from "workflowskill";

const adapter = new MockToolAdapter();
adapter.register("my_tool", async (args) => ({ output: "result" }));
```

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

## Low-level integration

`parseWorkflowFromMd`, `validateWorkflow`, and `runWorkflow` are also exported for consumers who need fine-grained control over each phase.

## Development

Runtime library (`runtime/`):

```bash
npm run typecheck          # tsc --noEmit
npm run test               # Run all tests (vitest)
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # tsdown
```

CLI (`cli/`):

```bash
npm install                # installs deps + symlinks runtime
npm run build              # tsdown → dist/cli.mjs
npm run typecheck
npm run test
npm link                   # makes `workflowskill` available globally
```

## License

[MIT](LICENSE)
