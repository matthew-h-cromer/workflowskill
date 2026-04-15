# WorkflowSkill

[![npm](https://img.shields.io/npm/v/workflowskill)](https://www.npmjs.com/package/workflowskill)
[![Node 20+](https://img.shields.io/badge/node-20%2B-blue)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Agents improvise. Workflows deliver.**

An open standard for turning agent skills into durable, deterministic workflows that run on any platform.

```
$ claude
> /workflow-author Write me a workflow that fetches my last 10 Gmail messages,
  summarizes them, and posts the summary to #daily-digest in Slack.
```

```
$ workflowskill run workflows/gmail-to-slack.md

Running gmail-to-slack
  toolkit: weldable (mock mode)
  ⟳ gmail.search_messages
  ✓ gmail.search_messages (12ms)
  ⟳ anthropic.llm
  ✓ anthropic.llm (9ms)
  ⟳ slack.post_message
  ✓ slack.post_message (4ms)
╭──────── gmail-to-slack ─────────╮
│ { "message_ts": "172..." }      │
╰─────────────────────────────────╯
```

---

## Why WorkflowSkill?

Agents are great at reasoning, but not every task needs reasoning. When an agent fetches your emails, summarizes them, and posts to Slack — that's a predictable sequence of actions. Running an agent through it every time means paying for inference, waiting on model calls, and hoping it doesn't hallucinate a step. The tasks where this hurts most are:

- **Structured** — the work is predictable and can be defined ahead of time
- **Multi-step** — useful automation chains together multiple actions
- **Repetitive** — they run on a schedule or in response to a trigger, not just once
- **Action-oriented** — the value comes from doing something (fetching a page, comparing prices, sending an email), not from open-ended reasoning

WorkflowSkill lets agents delegate these tasks to a runtime instead of improvising them. A workflow is authored once, then runs as deterministic code — no inference on every execution, no token burn, no drift. LLM calls only happen where you actually need intelligence.

Because the logic is code — not a prompt being re-interpreted — the runtime can offer capabilities that agents can't: durable execution that survives failures, automatic retries, timeouts, pausing and resuming, deterministic outcomes, and scheduling on a timer or triggering from external events.

Workflow Skills are portable across any platform that implements the WorkflowSkill standard, and they're built on the open [Agent Skills](https://agentskills.io/) spec. A workflow authored for one platform runs on any other that supports the same actions — no rewriting, no lock-in. The goal is to do for durable execution what Agent Skills did for skills — an open ecosystem of workflows where the whole community moves forward together.

To support WorkflowSkill, a platform implements two things: a [**toolkit**](#toolkits) (which handles action execution — routing `execute_activity()` calls to the platform's integrations) and a [**runtime**](#runtimes) (which handles orchestration — durability, checkpointing, retries, and pause/resume). These are independent extension points: any toolkit works with any runtime.

---

## Quickstart

**Prerequisites:** [Node.js 20+](https://nodejs.org/) · [pnpm](https://pnpm.io/) · [Claude Code](https://claude.ai/code)

### 1. Install

```sh
git clone https://github.com/matthew-h-cromer/workflowskill.git
cd workflowskill
pnpm install
pnpm build
```

The CLI is not yet published to npm. Invoke it via `node dist/cli/index.js` (shown below) or add it to your shell with `npm link` to get a global `workflowskill` binary.

### 2. Run the hello-world example

```sh
node dist/cli/index.js run examples/hello-world.md
```

```
hello-world
───────────

✓ Workflow complete
Output:
{
  "greeting": "Hello, World!"
}
```

Override the default input:

```sh
node dist/cli/index.js run examples/hello-world.md -i name=Linus
```

### 3. Author your own

Open Claude Code in this directory and use the `/workflow-author` skill:

```
> /workflow-author Write me a workflow that takes a name as input and returns a greeting.
```

Claude generates a `.md` file with YAML frontmatter and saves it to `workflows/`. Run it:

```sh
node dist/cli/index.js run workflows/greeting.md -i name=Linus
```

### 4. Call real services (mock mode)

The CLI ships with a **mock Weldable toolkit** that simulates action calls deterministically — no API keys, no network, no authentication. It's designed for authoring iteration: an agent can draft a workflow that uses Slack, Gmail, GitHub, Anthropic, or any of the other [built-in integrations](skill/toolkits/weldable/prompt.md), and you can run it locally to verify structure and data flow before deploying to a hosted runtime.

```
$ claude
> /workflow-author Write me a workflow that fetches my last 10 Gmail messages,
  summarizes them, and posts the summary to #daily-digest in Slack.
```

```sh
node dist/cli/index.js run workflows/gmail-to-slack.md
```

Running this same workflow against a live toolkit (with real credentials and durable execution) is the job of a hosted runtime like [Weldable](https://weldable.ai) — the workflow YAML is unchanged; only the execution environment differs.

---

## Toolkits

A toolkit handles **action execution** — it routes each `action` step to the right API, SDK, or service. Toolkit authors implement a single method: `execute(action, args, idempotencyKey) -> unknown`. The workflow YAML is unchanged regardless of which toolkit runs it.

| Toolkit | Platform | Actions |
|---------|----------|---------|
| `weldable` *(built-in, mock-only in this CLI)* | [Weldable](https://weldable.ai) | 11 integrations shipped locally: Anthropic, Discord, GitHub, Gmail, Google Calendar/Docs/Drive/Sheets/Tasks, Slack, Web. Hosted Weldable exposes 264+. |

The CLI's `run` command uses the mock Weldable toolkit. Real action execution happens on hosted runtimes that implement the toolkit protocol against live credentials.

[→ Implement a toolkit](CONTRIBUTING.md#toolkits)

---

## Runtimes

A runtime handles **workflow orchestration** — durability, checkpointing, retries, pause/resume, and signals. The same workflow code runs on any runtime; only the execution guarantees differ.

| Runtime | Description |
|---------|-------------|
| `in-memory` *(built-in)* | Single-process, non-durable. Signals via `EventEmitter`. Used by the CLI for local authoring and by the conformance suite. |
| `dbos` *(planned)* | Durable execution via [DBOS](https://dbos.dev). Each step checkpointed; crash recovery resumes from the last completed step. The `Runtime` protocol in `src/runtime/protocol.ts` maps directly to DBOS primitives. |

The CLI `run` command always uses the in-memory runtime. Hosted platforms supply their own durable runtime against the same protocol.

[→ Implement a runtime](CONTRIBUTING.md#runtimes)

---

## Specification

Workflows are declarative YAML documents. The interpreter traverses them deterministically against any conforming runtime and toolkit. This section is the authoritative format reference.

### Document structure

Workflows live in `.workflow.md` files. The YAML workflow definition goes in the frontmatter (between `---` delimiters); the markdown body below is a plain-language description of the workflow.

```yaml
---
version: 1
name: <slug>
description: <string>
inputs:
  <name>:
    type: <schema>
    default: <value>           # optional
    description: <string>      # optional
outputs:
  <name>: "{{ <expression> }}"
steps:
  - <step>
  - <step>
---
```

#### Relationship to Agent Skills

WorkflowSkill extends the open [Agent Skills](https://agentskills.io) standard. The `name` and `description` fields inherit the standard's constraints unchanged, so any conforming Agent Skills validator accepts a WorkflowSkill frontmatter block on those fields. The remaining fields (`version`, `inputs`, `outputs`, `steps`) are WorkflowSkill extensions.

| Field | Source | Rule |
|---|---|---|
| `name` | Agent Skills | Lowercase letters, numbers, and hyphens only. Max 64 chars. Cannot contain the reserved words `anthropic` or `claude`. |
| `description` | Agent Skills | Non-empty. Max 1024 chars. Should describe both what the workflow does and when to run it. |
| `version` | WorkflowSkill | Integer-major schema version. Always `1` in v1. |
| `inputs` | WorkflowSkill | Declared input parameters. |
| `outputs` | WorkflowSkill | Top-level output expressions (alternative to a `return` step). |
| `steps` | WorkflowSkill | Sequential list of step primitives — the workflow body. |

Agent Skills optional frontmatter fields that Claude Code recognizes (`when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`) are **not** consumed by the WorkflowSkill interpreter, but are neither forbidden nor rewritten. A consumer that treats a workflow file as an Agent Skill will see them; the interpreter ignores them.

### Expression language

**JSONata** is the only expression language. It handles both data reshaping and predicates.

No general-purpose code execution is supported in v1. If a transformation cannot be expressed in JSONata, the correct response is to expose the missing capability as an integration action, not to embed code in the workflow. This is a deliberate constraint: it keeps multi-tenant execution safe by construction, keeps workflows fully portable, and forces integration coverage to grow where real demand exists.

**Expression delimiters:**

- `{{ ... }}` — JSONata expression embedded in a string-typed field, evaluated against the execution context.
- Bare JSONata (no delimiters) in `transform.expr`, `if.when`, `while.when`, and `switch.on`. In predicate positions, any truthy JSONata result selects the branch. `foreach.items` uses `{{ }}` template syntax.

**Execution context:**

| Name                       | Contents                                                   |
| -------------------------- | ---------------------------------------------------------- |
| `steps.<id>.output`        | Output value of a completed step                           |
| `steps.<id>.error`         | Error object (only in scope inside `catch`)                |
| `input.<name>`             | Workflow inputs declared in top-level `inputs:`            |
| `workflow.owner`           | Publisher / runner identity                                |
| `workflow.run_id`          | Current run identifier                                     |
| `workflow.name`            | Workflow name                                              |
| `workflow.started_at`      | ISO timestamp                                              |
| `env.<name>`               | Publisher-scoped environment variables (allowlisted)       |

**Step scoping:**

`steps` is lexically scoped. Inside a `foreach` iteration or `parallel` branch, a new scope is pushed. Resolution walks inner-to-outer (read). Writes land in the innermost scope.

- Step `id`s must be unique among sibling steps (same lexical scope). Shadowing an outer id is a validation error.
- Inside a `foreach` body: `steps.<id>` resolves local-first. `<as>` and `$index` are bound by the loop.
- From outside a `foreach`: `steps.<loop_id>.output[i].<inner_id>.output` addresses iteration `i`'s inner step.
- From outside a `parallel`: `steps.<par_id>.branches.<name>.<inner_id>.output` addresses a branch's inner step.

**Non-deterministic JSONata built-ins:**

`$now()`, `$millis()`, `$random()` — because every step is wrapped in an idempotent checkpoint, these functions are evaluated once at first execution and their result is cached on replay. This is the correct durability semantic. Authors should be aware that `$now()` inside a transform returns the time of first execution, not replay time.

### Data flow

Implicit inside the workflow body: steps reference each other via expressions. Normal steps do not declare inputs or outputs.

Explicit only at one typed boundary: `inputs:` and `outputs:` at the workflow
top level.

Rationale: implicit expression references keep normal wiring tight and readable; explicit typed signatures at the workflow boundary give the workflow-level contract what it needs.

### Step primitives

Every step requires a unique `id` and a `description` (1–80 chars, single line). No exceptions — `wait` and `return` steps also require both.

#### `action`

Call an integration action.

```yaml
- id: list_unread
  type: action
  uses: gmail.search
  with:
    q: "is:unread newer_than:1d"
    maxResults: 50
```

#### `transform`

Reshape data via JSONata. Checkpointed as a first-class step.

```yaml
- id: urgent
  type: transform
  expr: |
    steps.list_unread.output.messages[
      "IMPORTANT" in labelIds
    ].{
      id: id,
      subject: headers.subject
    }
```

#### `if`

Conditional branch. JSONata predicate (bare, no `{{ }}`).

```yaml
- id: has_urgent
  type: if
  when: "$count(steps.urgent.output) >= input.threshold"
  then:
    - <step>
  else:         # optional
    - <step>
```

#### `switch`

Multi-way branch on a value.

```yaml
- id: route
  type: switch
  on: "steps.classify.output.category"
  cases:
    billing: [<step>]
    support: [<step>]
  default: [<step>]
```

#### `foreach`

Iterate a collection with bounded concurrency and optional rate limiting. Output is an ordered array of per-iteration scope maps, indexed by source item order.

```yaml
- id: enrich
  type: foreach
  items: "{{ steps.urgent.output }}"
  as: msg
  concurrency: 5          # optional, default 1 (sequential)
  rate_limit:              # optional
    max: 10
    per: "1s"              # "1s" | "1m" | "1h"
  body:
    - id: lookup
      type: action
      uses: clearbit.person_lookup
      with: { email: "{{ msg.from }}" }
```

`rate_limit` caps iteration-body starts across the whole loop. Combines with `concurrency`: concurrency bounds in-flight count, rate_limit bounds start frequency.

Outer-visible output: `steps.enrich.output[i].lookup.output` reaches iteration `i`'s `lookup` step.

#### `while`

Conditional loop. `max_iterations` is required. Supports optional rate limiting for polling patterns.

```yaml
- id: poll
  type: while
  when: "steps.check.output.status != 'done'"
  max_iterations: 60
  rate_limit:              # optional
    max: 1
    per: "5s"
  body:
    - <step>
```

#### `parallel`

Explicit fan-out with named branches. Output: `steps.<id>.branches.<name>.<inner_id>.output` is a branch's inner step output.

```yaml
- id: lookup
  type: parallel
  branches:
    clearbit:
      - type: action
        uses: clearbit.person
        with: { email: "{{ input.email }}" }
    hubspot:
      - type: action
        uses: hubspot.contact_by_email
        with: { email: "{{ input.email }}" }
```

#### `try` / `catch` / `finally`

Structured error handling. Inside `catch`, the error is in scope as `error`.

```yaml
- id: risky
  type: try
  body:
    - type: action
      uses: external.sync
  catch:
    - type: action
      uses: slack.post_message
      with:
        channel: "#ops"
        text: "{{ 'Sync failed: ' & error.message }}"
  finally:        # optional
    - type: action
      uses: metrics.increment
      with: { name: "sync_attempts" }
```

#### `wait`

Time-based suspension.

```yaml
- type: wait
  duration: "5m"

- type: wait
  until: "{{ input.scheduled_at }}"
```

#### `wait_for_signal`

External signal. Used for webhooks, inbound events, cross-workflow coordination, and any asynchronous resume.

```yaml
- id: await_payment
  type: wait_for_signal
  signal: "stripe.payment_succeeded"
  match:
    "customer.email": "{{ input.email }}"
  timeout: "7d"
  on_timeout: abort          # | continue  (default: abort)
```

Output when received: the signal payload. Output on `on_timeout: continue`: `null`.

#### `return`

Explicit workflow output. Alternative to top-level `outputs:`.

```yaml
- type: return
  value: "{{ steps.final.output }}"
```

### Step-level properties

**`retry` applies to `action` steps only.** It is meaningless on pure/deterministic steps and is rejected by the schema for all other step types.

```yaml
retry:
  max_attempts: <int>
  backoff: exponential | linear | fixed
  on: [<error_code>, ...]     # optional allowlist
timeout: <duration>
continue_on_error: <bool>     # default false
```

Checkpointing is not author-controllable. Every step checkpoints; this is a platform guarantee required by durable resume, the step inspector, and fork-based debug. Large-output concerns are handled by the interpreter (size caps, blob-backed references), not by per-step opt-outs.

- `retry` applies before error propagation. Exhausted attempts surface the last error.
- `continue_on_error: true` captures the error into `steps.<id>.error`, sets `steps.<id>.output` to null, and continues.

**Idempotency** is automatic, not declared. The interpreter passes a deterministic key derived from `run_id` + nested step path + iteration index (for `foreach`) + branch name (for `parallel`) to every action invocation. Integrations that honor idempotency headers (Stripe, Square, and similar) consume it transparently; others ignore it. This makes within-run retries and resumes safe without any author input.

For cross-run idempotency ("send this invoice exactly once, ever"), use the integration's native idempotency argument (e.g., Stripe's `idempotency_key`) as a normal `with:` value. Business-level dedup belongs to the integration contract, not the workflow primitive set.

### Error semantics

- Uncaught errors propagate to the nearest `try.catch`; if none exists, the workflow fails.
- Error object shape: `{ message, code, step_id, retryable, details }`.
- Inside `catch`, `error` refers to the most recent caught error.

### Checkpointing and durability

- Each step produces a checkpoint row: `{ run_id, step_id, status, input, output, error, started_at, ended_at }`.
- On worker crash or restart, execution resumes from the last completed step.
- Transforms are deterministic and re-run safely; actions rely on `idempotency_key` for safe replay.
- Forked runs (debug mode) clone checkpoint history up to a chosen step and execute forward on a new run_id.

### Interpreter determinism contract

The interpreter MUST traverse the YAML tree deterministically. Same workflow + same inputs → same sequence of runtime calls in the same order. This is the invariant that DBOS-backed (ordinal-based) and similar replay runtimes depend on.

All non-determinism (clocks, randomness, I/O) lives inside step thunks, never in the interpreter's control flow between steps.

**YAML edits invalidate in-progress runs.** If the tree structure changes, step ordinals shift and replay-based runtimes will detect a non-determinism error. Edits must produce new workflow instances; mid-run upgrades are not supported.

### `env.*` source

`env.*` is **never** populated from `process.env` or any ambient shell environment. Doing so would leak secrets into step inputs and checkpoint rows.

- **CLI mock mode:** `env` is empty by default. Populated only via explicit `--env KEY=VALUE` flags or `--env-file <path>`. Documented as "fake values for mock authoring only."
- **Hosted runtimes:** `env` is populated from the publisher's allowlisted, secrets-system-resolved values.

Secrets for real action calls are resolved by the integration layer at execution time, not surfaced to the workflow.

### Portability and conformance

Every workflow declares `version: 1`. Any conforming interpreter must:

1. Evaluate JSONata per the pinned spec version.
2. Support every primitive in this document.
3. Pass the published conformance test suite.

Interpreters MAY add non-standard primitives prefixed with `x-` (e.g., `type: x-custom`). Workflows using `x-` primitives are non-portable and must be flagged as such.

### Versioning

- `version` is integer-major only. Breaking changes bump the major; interpreters reject unknown versions.
- Non-breaking additions (new primitives, new step properties) are published as minor schema updates within the same major.

### Resolved design decisions

- **Sequential list, not DAG.** Workflow body is a sequential `steps:` list; branching emerges from nested primitives (`if`, `switch`, `parallel`, `foreach`). Revisit only if real composition hits limits.
- **Saga / compensation deferred.** `compensate:` is reserved as a step-level key name; not implemented in v1.
- **Rate limiting lives on loop primitives.** `foreach` and `while` support `rate_limit`. Keeps rate control a workflow concern, not an integration implementation burden.
- **No workflow-scoped mutable state.** Transforms-as-steps subsume it. Reconsider only if durable demand emerges.
- **String interpolation is single-mode.** `{{ ... }}` is always JSONata; outside the delimiters is literal. Multi-valued interpolation uses JSONata's `&` operator inside a single `{{ }}`.
- **Step reference scoping.** All completed steps in the same scope are referenceable by id. Ids must be unique per lexical scope; shadowing is a validation error. Per-iteration references use the iteration body's local ids plus `$index`.
- **`retry` applies to `action` steps only.** Schema rejects `retry` on all other step types. Retry on deterministic steps is meaningless.
- **`on_timeout: continue` output is always `null`** for `wait_for_signal`.
- **Parallel fan-out uses child workflows.** On replay-based durable runtimes (e.g. DBOS), `foreach` and `parallel` spawn child workflows per branch/iteration to keep each branch's step ordinal space independent.
