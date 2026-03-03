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
  url:
    type: string

outputs:
  results:
    type: array
    value: $steps.fetch.output.results

steps:
  - id: fetch
    type: tool
    tool: web.fetch
    inputs:
      url:
        type: string
        value: $inputs.url
    outputs:
      results:
        type: array
        value: $result.items

  - id: guard_empty
    type: exit
    condition: $steps.fetch.output.results.length == 0
    status: success
    output: { results: [] }
    inputs: {}
    outputs: {}
```

## Install

```bash
npm install workflowskill
```

## Authoring

A WorkflowSkill is authored via natural conversation with any agent system that supports the [Agent Skills](https://agentskills.io/home) format.

1. Prompt your agent to create a workflow: "I want to check this website daily"
   - For Claude Code, this package ships `skill/SKILL.md` which teaches it to author valid WorkflowSkill YAML. For other agent tools, provide the contents of `node_modules/workflowskill/skill/SKILL.md` as context.
2. Your agent writes a WorkflowSkill.
3. Integrate it with your host using the [Library API](#library-api).

**Evaluate the output:** Check `status` for overall success. If a step failed, its `error` field explains why. For `each` steps, `iterations` shows per-item results. Compare per-step `inputs` and `output` values against your expectations to find where the data flow broke down.

## Language overview

WorkflowSkill workflows are YAML documents with four step types:

| Step type     | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `tool`        | Invoke any tool via the host's `ToolAdapter` (APIs, functions, LLM calls, etc.)     |
| `transform`   | Filter, map, or sort data without side effects                                       |
| `conditional` | Branch execution based on an expression                                              |
| `exit`        | Terminate early with a status and output                                             |

All external calls — including LLM inference — go through `tool` steps. The runtime itself has no LLM dependency. The host registers whatever tools are available in the deployment context.

Steps are connected by `$steps.<id>.output.<field>` references. Loops use `each`. Error handling uses `on_error: fail | ignore` (retries are a separate `retry:` field).

See the [full language specification](https://github.com/matthew-h-cromer/workflowskill/blob/main/SPEC.md) for details.

## Quick start

```typescript
import { runWorkflowSkill, MockToolAdapter } from "workflowskill";

const adapter = new MockToolAdapter();
adapter.register("classify", async (args) => ({
  output: { label: String(args.text).includes("urgent") ? "high" : "normal" },
}));

const content = `
inputs:
  message:
    type: string
outputs:
  label:
    type: string
    value: $steps.classify.output.label
steps:
  - id: classify
    type: tool
    tool: classify
    inputs:
      text:
        type: string
        value: $inputs.message
    outputs:
      label:
        type: string
        value: $result.label
`;

const log = await runWorkflowSkill({
  content,
  inputs: { message: "Urgent: server is down" },
  toolAdapter: adapter,
  onEvent: (event) => console.log(event.type),
});

if (log.status === "success") {
  console.log(log.outputs);                          // { label: "high" }
  const step = log.steps.find((s) => s.id === "classify");
  console.log(step?.output);                         // { label: "high" }
} else {
  console.error(log.error);                          // { phase, message, details? }
}
```

- **Accepts raw content** — SKILL.md with frontmatter or bare workflow YAML, no pre-parsing needed
- **Never throws** — parse, validation, and execution failures are encoded in `RunLog.error`
- **Pre-flight validation** — `validateWorkflowSkill({ content, toolAdapter? })` returns `{ valid, errors }` without running the workflow

## ToolAdapter

`ToolAdapter` is the only integration boundary between the runtime and the host:

```typescript
interface ToolResult {
  output: unknown;
  error?: string;
}

interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];
}
```

| Method | Called when | Contract |
| --- | --- | --- |
| `invoke(name, args)` | Step execution | Return `{ output }` on success. Set `error` to signal failure — the runtime throws a retriable `StepExecutionError`, triggering the step's `retry` policy if configured. |
| `has(name)` | Validation | Return `true` if the tool is available. Used to report missing tools before execution starts. |
| `list()` | Host introspection | Optional. Not called by the runtime — provided for hosts that want to present tool catalogs. |

Wrap any tool source behind this interface: MCP clients, function registries, LLM-as-a-tool, or external APIs. For testing, **`MockToolAdapter`** lets you supply inline handlers without any external dependencies:

```typescript
import { MockToolAdapter } from "workflowskill";

const adapter = new MockToolAdapter();
adapter.register("my_tool", async (args) => ({ output: "result" }));
```

## Events

Pass an `onEvent` callback to `runWorkflowSkill` or `runWorkflow` to receive live progress events during execution:

```typescript
const log = await runWorkflowSkill({
  content,
  inputs,
  toolAdapter,
  onEvent(event: RuntimeEvent) {
    if (event.type === "step_complete") {
      console.log(event.stepId, event.status, `${event.duration_ms}ms`);
    }
  },
});
```

`RuntimeEvent` is a discriminated union — narrow on `event.type` to access type-specific fields:

| Event type | When it fires | Key fields |
| --- | --- | --- |
| `workflow_start` | Before the first step executes | `workflow`, `totalSteps` |
| `step_start` | After guard passes, before inputs are resolved | `stepId`, `stepType`, `tool?` |
| `step_complete` | After a step finishes (success or failure) | `stepId`, `status`, `duration_ms`, `iterations?` |
| `step_skip` | When a step is skipped | `stepId`, `reason` |
| `step_retry` | Before each retry attempt | `stepId`, `attempt`, `error` |
| `step_error` | When a step fails, before halt/ignore decision | `stepId`, `error`, `onError` |
| `each_progress` | After each iteration of an `each` step | `stepId`, `current`, `total` |
| `workflow_complete` | After the last step or early exit | `status`, `duration_ms`, `summary` |

## Run log

Every call to `runWorkflowSkill` returns a `RunLog`. On failure, `error` describes the phase and cause; on success, `outputs` contains the workflow's declared outputs.

```typescript
interface RunLog {
  id: string;
  workflow: string;
  status: "success" | "failed";
  summary: { steps_executed: number; steps_skipped: number; total_duration_ms: number };
  started_at: string;             // ISO 8601
  completed_at: string;           // ISO 8601
  duration_ms: number;
  inputs: Record<string, unknown>;
  steps: StepRecord[];
  outputs: Record<string, unknown>;
  error?: { phase: "parse" | "validate" | "execute"; message: string; details?: unknown };
}

interface StepRecord {
  id: string;
  executor: "tool" | "transform" | "conditional" | "exit";
  status: "success" | "failed" | "skipped";
  reason?: string;                // why skipped
  duration_ms: number;
  inputs?: Record<string, unknown>;
  output?: unknown;
  iterations?: number;            // each steps only
  error?: string;                 // failed steps only
  retries?: { attempts: number; errors: string[] };  // when retries occurred
}
```

- `error` is present only when the run failed; `phase` indicates where it failed
- `output` holds the step's mapped output after `$result` expressions are applied
- `iterations` is set for `each` steps; `retries` is only present when retry attempts were made

## Agent integration

### AUTHORING_SKILL

`AUTHORING_SKILL` is a string constant containing full authoring instructions for the WorkflowSkill language. Inject it as system context to enable any LLM to author valid workflows:

```typescript
import { AUTHORING_SKILL } from "workflowskill";

const systemPrompt = `${AUTHORING_SKILL}\n\nYour task: ${userRequest}`;
```

### Low-level API

`parseWorkflowFromMd`, `validateWorkflow`, and `runWorkflow` are exported for consumers who need fine-grained control over each phase:

```typescript
import { parseWorkflowFromMd, validateWorkflow, runWorkflow } from "workflowskill";

const workflow = parseWorkflowFromMd(content);             // throws ParseError on failure
const result = validateWorkflow(workflow, toolAdapter);    // returns { valid, errors }
const log = await runWorkflow({ workflow, inputs, toolAdapter, onEvent });
```

Use these when caching parsed workflows across multiple runs, running validation separately from execution, or building custom pipelines around the runtime.

## Documentation

Full specification, design rationale, and examples: [github.com/matthew-h-cromer/workflowskill](https://github.com/matthew-h-cromer/workflowskill)

## License

[MIT](https://github.com/matthew-h-cromer/workflowskill/blob/main/LICENSE)
