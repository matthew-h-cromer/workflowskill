# WorkflowSkill

A standard for authoring durable YAML workflows from natural language descriptions, plus a CLI and interpreter for developing and testing them.

## Purpose

**The standard** — `skill/SKILL.md` is the main artifact: a platform-agnostic authoring guide published via npm. It teaches LLMs to emit declarative YAML workflows.

**The interpreter** (`src/interpreter/`) executes those workflows deterministically. It is the reference implementation — Weldable and other runtimes build their own against the Specification section of `README.md` + `conformance/`.

**The CLI** (`src/cli/`) runs workflows locally in mock mode (no real action calls). Used for authoring iteration and eval.

## Repo Structure

```
skill/
  SKILL.md                           # Workflow-author skill (platform-agnostic, the main artifact)
  toolkits/
    weldable/
      prompt.md                      # Weldable-specific authoring context
src/
  schema/                            # PUBLISHED — Zod schemas + TypeScript types
    index.ts
    workflow.ts
    steps.ts
    expressions.ts                   # DurationSchema, parseDurationMs, branded expr types
    version.ts
    json-schema.ts                   # zod-to-json-schema emitter
  interpreter/                       # INTERNAL
    index.ts                         # runWorkflow(workflow, inputs, runtime, toolkit)
    context.ts                       # ExecutionContext: steps, input, workflow, env
    expressions/
      jsonata.ts                     # evaluateJsonata + interpolate ({{ }} template scanning)
      common.ts                      # shared utilities (truncate)
    steps/                           # One file per step type
      action.ts transform.ts if.ts switch.ts foreach.ts while.ts
      parallel.ts try.ts wait.ts wait_for_signal.ts
      return.ts
    errors.ts                        # WorkflowError shape
    idempotency.ts                   # sha256(runId | stepPath) — path encodes iteration+branch
  runtime/
    protocol.ts                      # Runtime interface
    memory.ts                        # InMemoryRuntime (EventEmitter-based signals)
  toolkit/
    protocol.ts                      # Toolkit interface: execute(action, args, idempotencyKey)
    registry.ts                      # ToolkitRegistry
  loader/
    frontmatter.ts                   # Extract frontmatter YAML and markdown body from .workflow.md
    parse.ts                         # .workflow.md → Zod-validated Workflow + body
  cli/
    index.ts                         # commander entrypoint; bin: workflowskill
    run.ts
    login.ts
    display.ts
examples/
  hello-world.md
  gmail-triage.md
  human-review.md
conformance/
  fixtures/<name>/
    workflow.md
    inputs.json
    expected_output.json
  runner.ts
evals/                               # Dev-only; not published
  setup.ts
  harness.ts
  checks.ts
  tests/
```

## Development Commands

```sh
pnpm install               # Install dependencies
pnpm typecheck             # tsc --noEmit
pnpm lint                  # biome / eslint
pnpm test                  # vitest run (unit + integration)
pnpm conformance           # run conformance fixtures
pnpm build                 # tsc → dist/

# Run a workflow locally (mock mode):
pnpm workflowskill run examples/hello-world.md -i name=Alice
pnpm workflowskill run examples/gmail-triage.md
```

## Local mock integrations

The CLI's Weldable toolkit imports integration packages directly from the weldable repo at `../weldable/packages/*`. Before running `pnpm install` here, build the integration packages:

```sh
# From ../weldable
pnpm -r build
```

No login or API key is required for `workflowskill run` — mock execution is fully offline.

## Published Surface

```json
{
  "exports": {
    ".":        { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js" },
    "./skill":  "./skill/index.js"
  },
  "files": ["dist/schema/**", "skill/**"]
}
```

`./skill/index.js` exports absolute paths to `SKILL.md` and `toolkits/weldable/prompt.md` so consumers can read them without guessing file locations.

**The CLI is internal** (not exported, only exposed as the `workflowskill` bin). The schema, validate, loader, interpreter, runtime, and toolkit sub-paths are all exported. Weldable and other consumers may import from them, but are encouraged to build their own interpreter against the Specification section of `README.md` + `conformance/` + the Zod schema.

## Architecture Notes

### Expression Language

**JSONata only.** Used two ways:

- **Bare** (the field IS the expression, no delimiters) in `transform.expr`, `if.when`, `while.when`, and `switch.on`. In predicate positions (`when`/`on`) any truthy JSONata result selects the branch.
- **Template** via `{{ expr }}` spans inside string-typed fields everywhere else. `interpolate(str, ctx)` scans for `{{ }}` spans and evaluates each. A string that is exactly one `{{ expr }}` span returns the raw value; strings with surrounding text are coerced to string.

### Execution Context

```ts
interface ExecutionContext {
  stack: StepScope[];              // outer → inner; resolution walks end → start
  input: Record<string, unknown>;
  workflow: { owner: {...}; run_id: string; name: string; started_at: string };
  env: Record<string, unknown>;
}
```

Step outputs are accessed as `steps.<id>.output`. Foreach iterations push a new scope; parallel branches each get their own scope. Parallel output shape: `steps.<id>.branches.<name>.<inner_id>.output`.

### Runtime Protocol

The `Runtime` interface in `src/runtime/protocol.ts` maps to DBOS primitives:

- `executeStep(path, fn, opts?)` — atomic "execute or return cached." Maps to `DBOS.runStep`.
- `executeBranches(path, branches, opts?)` — fan-out for `foreach`/`parallel`. Child workflows on DBOS; `Promise.all` + semaphore on InMemoryRuntime.
- `sleep(path, ms)` — maps to `DBOS.sleep`.
- `waitForSignal(path, opts)` — match predicate + timeout. Maps to `DBOS.recv` loop.

**Interpreter invariant:** tree traversal order depends only on parsed YAML + inputs. Every `executeStep` call must happen in the same deterministic order for a given workflow + inputs. This is what DBOS's ordinal-based replay depends on.

### Idempotency

`src/interpreter/idempotency.ts`: `sha256(runId | stepPath)`. The `stepPath` encodes the iteration index and branch name as structural segments (e.g. `body[2]/action`), so the key is a pure function of stable inputs — safe to use as an idempotency key for action calls.

## Conformance Suite

Fixtures under `conformance/fixtures/<name>/` each have `workflow.md`, `inputs.json`, and `expected_output.json`. The runner auto-discovers all fixtures.

```sh
pnpm conformance      # all fixtures
```

Third-party interpreters can consume the conformance suite directly — `conformance/README.md` describes the contract.

## Key Constraints

- **YAML edits invalidate in-progress runs.** Tree structure changes shift DBOS ordinals. Edits produce new workflow instances; mid-run upgrades are not supported.
- **Parallel fan-out uses child workflows** on durable runtimes. Authors always use `foreach`/`parallel` — the runtime decides how to parallelize.
- **Workflow body must be deterministic.** All non-determinism lives inside `executeStep` thunks. Control flow depends only on parsed YAML + inputs + checkpointed step outputs.
- **`env.*` is never `process.env`.** CLI populates `env` only from explicit `--env KEY=VALUE` flags. Secrets are resolved by integrations at execution time, not surfaced to workflows.
- **`retry` applies to `action` steps only.** Schema rejects it on all other step types.

## Eval Workflow

Evals are manual-only (require `ANTHROPIC_API_KEY`):

```sh
ANTHROPIC_API_KEY=... pnpm eval                    # all evals
ANTHROPIC_API_KEY=... pnpm eval -- --snapshot      # save snapshots
ANTHROPIC_API_KEY=... pnpm eval -- -t foreach      # single test
```

Evals call Claude with `skill/SKILL.md` as the system prompt and a natural-language task, then assert the generated YAML has correct step structure via `evals/checks.ts`. Snapshots in `evals/snapshots/` are the record of what the model generated — keep them current.

### Skill authoring files

- **`skill/SKILL.md`** — Platform-agnostic authoring guide. All authoring behavior changes go here. Must never contain platform-specific details.
- **`.claude/skills/workflow-author/SKILL.md`** — Claude Code entry point. Reads `skill/SKILL.md` + `skill/toolkits/weldable/prompt.md`. Instructs Claude to write the workflow file and run it in mock mode.
- **`skill/toolkits/weldable/prompt.md`** — Weldable-specific authoring context: action discovery, probing, mock execution.

When editing `skill/SKILL.md`, run evals before and after to catch regressions.
