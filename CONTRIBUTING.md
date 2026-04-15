# Contributing

WorkflowSkill has two extension points: **toolkits** (action execution) and **runtimes** (workflow orchestration). They are independent — any toolkit works with any runtime. Both are TypeScript interfaces defined in `src/`.

If you just want to run WorkflowSkill on your own platform without modifying this repo, skip to [Building your own interpreter](#building-your-own-interpreter).

---

## Dev setup

```sh
pnpm install
pnpm typecheck
pnpm test             # vitest — unit + integration
pnpm conformance      # fixture-based conformance suite
pnpm build            # tsup → dist/

# Run a workflow locally (mock mode):
pnpm workflowskill run examples/hello-world.md -i name=Alice
pnpm workflowskill run examples/hello-world.md --toolkit weldable --runtime memory
```

The default `weldable` toolkit imports integration packages from `../weldable/packages/*`. Before `pnpm install` here, run `pnpm -r build` inside `../weldable`.

Evals are manual (require `ANTHROPIC_API_KEY`): `pnpm eval`.

---

## Toolkits

A toolkit translates action names + args into calls against a specific platform. When a workflow step executes `gmail.search`, the toolkit is what actually runs it.

### Implement the `Toolkit` interface

`src/toolkit/protocol.ts`:

```ts
export interface Toolkit {
  readonly name: string;
  readonly description: string;
  execute(
    action: string,
    args: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<unknown>;
  getAuthoringContext(): Promise<string>;
}
```

Throw the error types defined alongside the interface where they apply:

- `ActionNotFoundError` — unknown action name.
- `ActionArgsError` — required args missing.
- `IntegrationNotConnectedError` — the target integration isn't authorized for this user.

The `idempotencyKey` is derived by the interpreter via `src/interpreter/idempotency.ts` as `sha256(runId + path + iteration + branch)`. Pass it through to APIs that support idempotency headers (Stripe, Square, etc.) to make action calls safely retryable.

Reference implementation: `src/toolkit/weldable/mock.ts` (catch-all dispatch against imported Weldable integration packages) and `src/toolkit/weldable/registry.ts` (flat action-ID map).

### Authoring prompt

Write `skill/toolkits/<name>/prompt.md` describing available action names, their args, and response shapes. This file is what `getAuthoringContext()` must return — it's injected into Claude when authoring workflows for your toolkit. See `skill/toolkits/weldable/prompt.md` for an example.

### Register it

Add your factory to `src/toolkit/registry.ts`:

```ts
const registry: Record<string, ToolkitFactory> = {
  weldable: async () => {
    const { WeldableMockToolkit } = await import("./weldable/mock.js");
    return new WeldableMockToolkit();
  },
  myplatform: async () => {
    const { MyPlatformToolkit } = await import("./myplatform/toolkit.js");
    return new MyPlatformToolkit();
  },
};
```

Users select it with `pnpm workflowskill run ... --toolkit myplatform`.

### Tests

Add `test/toolkit/<name>.test.ts`. Verify protocol compliance, action routing, and error paths (missing action, missing args, not-connected). See `test/cli/registry.test.ts` for the registry round-trip pattern.

### Examples

Add at least one runnable workflow under `examples/` that exercises your toolkit.

### PR checklist

- Toolkit class implements `Toolkit`.
- Factory registered in `src/toolkit/registry.ts`.
- `skill/toolkits/<name>/prompt.md` documents all actions with arg names and response shapes.
- At least one runnable example in `examples/`.
- Tests cover protocol compliance, action routing, and the three error types.

You should not need to touch the interpreter, schema, loader, or SKILL.md.

---

## Runtimes

A runtime provides the orchestration layer — checkpointing, crash recovery, retries, and signals. The toolkit is injected at workflow-start time; the workflow body never sees either directly.

### Implement the `Runtime` interface

`src/runtime/protocol.ts`:

```ts
export interface Runtime {
  readonly runId: string;
  readonly owner: { email?: string; [k: string]: unknown };
  now(): Date;
  executeStep<T>(path: string, fn: () => Promise<T>, opts?: StepOptions): Promise<T>;
  executeBranches<T>(path: string, branches: BranchSpec<T>[], opts?: BranchOptions): Promise<T[]>;
  sleep(path: string, ms: number): Promise<void>;
  waitForSignal<T>(path: string, opts: SignalOptions): Promise<SignalResult<T>>;
}
```

The DBOS mapping comments in `protocol.ts` describe the intended semantics for each method.

### Key invariants

- **Call-order determinism.** Tree traversal order depends only on parsed YAML + inputs. Every `executeStep` call must happen in the same order for a given workflow + inputs on replay. DBOS's ordinal-based replay depends on this — if your runtime uses replay, enforce it.
- **Fan-out uses child workflows.** On durable runtimes, `executeBranches` must spawn one child workflow per branch, not `Promise.all` inside a single workflow (which would interleave ordinals).
- **Signal predicates must be pure.** `waitForSignal` may be called across restarts; the match function depends only on its payload argument.

Reference implementation: `src/runtime/memory.ts` — an in-process, non-durable runtime suitable for CLI authoring. It's the right thing to read first.

### Register it

Add your factory to `src/runtime/registry.ts`. Users select it with `--runtime <name>`.

### Tests

Add `test/runtime/<name>.test.ts`. Protocol compliance + the determinism invariant (a workflow replayed with the same inputs hits `executeStep` in the same order).

### PR checklist

- Runtime class implements `Runtime`.
- Factory registered in `src/runtime/registry.ts`.
- Tests cover protocol compliance and determinism under replay (if applicable).
- Conformance suite passes against your runtime: `pnpm conformance` with your runtime swapped in.

---

## Building your own interpreter

Third-party platforms (Weldable, etc.) typically build their own interpreter rather than adding a toolkit to this repo. The contract:

- **Schema** — consume `workflowskill` (Zod schemas + TypeScript types). Exported from `src/schema/`.
- **Conformance suite** — `conformance/fixtures/<name>/` each contain `workflow.md`, `inputs.json`, and (optionally) `expected_output.json`. Your interpreter must produce the expected output for each fixture. Run via `pnpm conformance` after pointing the runner at your implementation.
- **Specification** — the "Specification" section of `README.md` documents step semantics, expression evaluation (JSONata), output shapes, and scoping rules.

The published npm surface is deliberately narrow: schema + SKILL.md only. Everything else in `src/` is internal reference material.

---

## Core changes

Changes to any of these require maintainer review and usually a proposal:

- `skill/SKILL.md` — the platform-agnostic authoring guide. Run `pnpm eval` before and after; update snapshots if behavior intentionally shifts.
- `src/schema/` — Zod schemas. Changes propagate to every interpreter; version bumps may be required.
- `src/interpreter/` — reference implementation semantics.
- `conformance/fixtures/` — the contract third parties rely on. New fixtures welcome; changing existing ones is a breaking change.

Toolkits and runtimes live behind the registry and don't touch core — if a contribution requires core changes, flag it in the PR and explain why.
