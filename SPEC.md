# WorkflowSkill Specification

> **Related documents:** [Proposal](PROPOSAL.md) | [Examples](examples/)

## Contents

- [Quick Example](#quick-example)
- [Context](#context)
- [Proposal Requirements](#proposal-requirements)
- [Authoring Model](#authoring-model)
- [WorkflowSkill](#workflowskill)
  - [Backwards Compatibility](#backwards-compatibility)
  - [Workflow Inputs and Outputs](#workflow-inputs-and-outputs)
  - [Step Definition](#step-definition)
  - [Step Inputs and Outputs](#step-inputs-and-outputs)
  - [Expression Language](#expression-language)
  - [Step Types](#step-types)
  - [Flow Control](#flow-control)
- [Runtime](#runtime)
  - [Execution Model](#execution-model)
  - [Step Executors](#step-executors)
  - [Error Handling](#error-handling)
  - [Run Log](#run-log)
  - [Runtime Boundaries](#runtime-boundaries)
  - [Conformance](#conformance)

## Quick Example

A minimal workflow that fetches data, transforms it, and exits with a result:

```yaml
inputs:
  query:
    type: string
    default: "software engineer"

outputs:
  jobs:
    type: array
    value: $steps.extract.output.items

steps:
  - id: fetch
    type: tool
    tool: http.request
    inputs:
      url:
        type: string
        value: "https://example.com/jobs?q=${inputs.query}"
    outputs:
      html:
        type: string
        value: $result.body

  - id: extract
    type: tool
    tool: html.select
    inputs:
      html:
        type: string
        value: $steps.fetch.output.html
      selector:
        type: string
        value: ".job-title"
    outputs:
      items:
        type: array
        value: $result.results

  - id: guard_empty
    type: exit
    condition: $steps.extract.output.items.length == 0
    status: success
    output: { jobs: [] }
```

Steps wire data with `$steps.<id>.output.<field>`. The `condition` guard on the exit step fires only when the results are empty. See [examples/](examples/) for runnable workflows.

## Context

**Agent:** A running instance that pairs a model with memory, tools, and skills to act on behalf of a user. The agent is the subject that invokes tools, interprets skills, and executes workflows. Where a tool *does* and a skill *knows*, an agent *acts*.

**Tool:** A primitive capability the agent can invoke, such as MCP server endpoints, bash scripts, or Python modules. Extends what agents can do beyond pure language generation.

**Skill:** Procedural knowledge enabling domain expertise, new capabilities, repeatable workflows, or interoperability for agents. Agents load skills into their context when deemed appropriate. Skills follow the AgentSkill standard defined at agentskills.io.

**Workflow:** Any task that is repeatable and contains discrete steps. A skill may define a workflow.

**Deterministic:** A system that always produces the exact same output from the same input. In this proposal we are using the term loosely. Inference is not deterministic. We just care to make our systems as deterministic as possible.

**Composable:** The ability for smaller components to be combined in ways that build more complex and useful systems. In this proposal, we aim to make skills composable, which makes them more useful.

**Cost:** Ultimately we care about minimizing the amount of money we spend to get a discrete amount of work done via agents. In this proposal we will speak about tokens as a proxy for cost.

**Reliability:** The agent's ability to produce consistent, predictable results across repeated runs, even when individual steps fail.

**★ WorkflowSkill:** The proposed extension to the AgentSkill standard which makes a skill executable by a runtime in a way that is deterministic and composable, aiming to drastically reduce cost and increase reliability when agents execute workflows.

## Proposal Requirements

**PR1: Natural Language Authoring**
I want users to describe a workflow in plain language and have an agent generate the WorkflowSkill YAML, so that creating an automation is as easy as explaining what you want and no one has to write YAML by hand.

**PR2: Autonomous Improvement**
I want agents to inspect workflow definitions and structured run logs, identify failures or inefficiencies, and propose improvements autonomously, so that workflows get better over time without the user ever editing the workflow directly.

**PR3: Workflow Language**
I want a declarative workflow language that a lightweight runtime can execute directly, so that deterministic steps run without LLM inference and cost scales with complexity rather than frequency.

**PR4: Targeted LLM Usage**
I want to specify which model to use per LLM step so that judgment-heavy steps can use a capable model while simple classification or summarization steps use a cheaper one, and deterministic steps use no model at all.

**PR5: Backwards Compatibility**
I want WorkflowSkill to live inside the existing SKILL.md format so that adoption is incremental, systems without a runtime still function, no existing skills break, and the ecosystem doesn't fork.

**PR6: Input/Output Schemas**
I want typed, validated inputs and outputs on every workflow so that workflows are self-documenting, callers get clear errors on bad input, and agents can programmatically assess whether a run produced a valid result.

**PR7: Observability**
I want structured, step-level run logs with timing, inputs, outputs, and failure reasons so that debugging a failed workflow is a lookup rather than a transcript interpretation exercise.

**PR8: Traceability**
I want every workflow execution to produce a unique run ID and a full record of which steps ran, which were skipped, and what data flowed between them, so that I can reconstruct exactly what happened in any past run without ambiguity.

**PR9: Flow Control**
I want conditional branching, iteration, and early exits expressed declaratively so that workflow logic is visible and auditable rather than improvised per-run by the LLM.

**PR10: Error Handling**
I want explicit, per-step error handling semantics (fail, ignore) so that a single step failure doesn't silently corrupt the rest of the workflow or produce a partial result the user mistakes for a complete one.

**PR11: Retries**
I want configurable retry policies with backoff so that transient failures (rate limits, network timeouts, temporary API errors) are absorbed automatically without human intervention or wasted LLM reasoning about what to do next.

### Authoring Model

A reasonable concern: declarative YAML is harder to write and maintain than natural language instructions. If WorkflowSkill trades runtime cost for authoring cost, the tradeoff might not be worth it.

The answer is that humans won't write most workflows. LLMs will. PR1 (Natural Language Authoring) is not aspirational. It is how the format is designed to be used. A user describes what they want: "triage my email every morning, score each one for importance, send me the important ones on Slack." An agent generates the WorkflowSkill YAML, validates it, and offers it for review. The YAML is the execution artifact, not the authoring surface.

This is analogous to how SQL is used in practice. Most SQL is generated by ORMs, query builders, and application code, not typed by hand. The structured format exists so machines can execute it reliably, not so humans can write it comfortably. The same applies here. The workflow YAML is legible enough for a human to review and audit, but the primary author is an agent.

The structured format also enables PR2 (Autonomous Improvement). An agent can read a workflow definition, compare it against run logs, identify failures or inefficiencies, and propose modifications. This is possible precisely because the format is structured and machine-readable. Natural language instructions are easy to write but hard to improve systematically.

## WorkflowSkill

A WorkflowSkill is defined by adding a `workflow` fenced code block to an existing SKILL.md file. The block contains a YAML execution plan.

```
---
name: string
description: string
---
```

````yaml
```workflow
inputs:
  <name>: { type: string|int|float|boolean|array|object, default: <value> }
outputs:
  <name>: { type: string|int|float|boolean|array|object, value: <expression> }
steps:
  - id: string
    type: tool|llm|transform|conditional|exit
    description: string
    inputs:
      <name>: { type: <type>, value: <expression>, default: <value> }
    outputs:
      <name>: { type: <type>, value: <expression> }

    # Tool fields
    tool: string                    # registered tool name

    # LLM fields
    model: string                   # model identifier (optional)
    prompt: string                  # prompt template with $-expressions
    response_format: object         # structured output hint (optional)

    # Transform fields
    operation: filter|map|sort      # transform operation
    where: expression               # filter: keep items where true
    expression: object              # map: output shape per item
    field: string                   # sort: field to sort by
    direction: asc|desc             # sort: order (default: asc)

    # Conditional fields
    condition: expression           # branch condition
    then: [step_id, ...]            # true branch
    else: [step_id, ...]            # false branch (optional)

    # Exit fields
    status: success|failed          # termination status
    output: expression              # final output (optional)

    # Common flow control fields
    condition: expression           # guard: skip if false (optional)
    each: expression                # iterate over array (optional)
    on_error: fail|ignore           # error strategy (default: fail)
    retry:                          # retry policy (optional)
      max: int
      delay: duration              # e.g. "2s", "500ms"
      backoff: float
```
````

...

### Backwards Compatibility

This placement inside SKILL.md is intentional to satisfy **PR5: Backwards Compatibility**. Systems without a WorkflowSkill runtime read the block as documentation. The LLM can interpret the YAML and execute a reasonable approximation of it. Systems with a runtime execute it directly. A single skill file works in both contexts. Adoption is incremental, and no existing skills break.

### Workflow Inputs and Outputs

A workflow should have a defined schema for inputs and outputs. Being able to execute a WorkflowSkill with inputs makes WorkflowSkills vastly more reusable. Furthermore, it enables composability of WorkflowSkills. Being able to validate outputs against a schema gives agents tools to dynamically assess the effectiveness of the workflow and improve it autonomously.

### Step Definition

| Field | Required | Description |
|-------|----------|-------------|
| id | yes | Unique identifier within the workflow. Referenced by other steps via `$steps.<id>.output`. |
| type | yes | One of: `tool`, `llm`, `transform`, `conditional`, `exit`. |
| description | no | Human-readable explanation. Displayed in run logs. |
| inputs | no | Named input schema. Required for tool, llm, and transform steps. Not used by exit or conditional steps. |
| outputs | no | Named output schema. Required for tool, llm, and transform steps. Not used by exit or conditional steps. |
| condition | no | Boolean expression. If false, the step is skipped and its output is null. This is a guard clause. Use it for "run this step only if X." For routing between different paths, use a `conditional` step instead. |
| each | no | Expression resolving to an array. The step executes once per element; output is an array of results. `$item` and `$index` are available within the step. Not valid on `exit` steps; rejected at validation time. |
| on_error | no | Error handling strategy: `fail` (default) or `ignore` (log the error and continue with null output). |
| retry | no | Retry policy: `{ max: int, delay: duration, backoff: float }`. Duration string: integer followed by `ms` (milliseconds) or `s` (seconds). Examples: `"500ms"`, `"2s"`. |

### Step Inputs and Outputs

Every step declares typed inputs and outputs. This serves three purposes:

**Pre-execution validation.** Before executing any steps, the runtime walks the step graph and verifies that every input resolves to a source with a compatible type. A wiring error like passing a string where an array is expected is caught before anything runs.

**Post-step validation.** After each step executes, the runtime validates its actual output against the declared schema. A step that produces unexpected output fails explicitly rather than silently corrupting downstream steps.

**Composability contracts.** When workflow composition is supported (see Future Work), input and output schemas are validated across the boundary between parent and child workflows.

**Step input `value`** — a `$`-expression that resolves from the runtime context (`$inputs`, `$steps`, `$item`, `$index`). This wires data from earlier steps or workflow inputs into the current step.

```yaml
inputs:
  messages:
    type: array
    items: { type: object, properties: { from: string, subject: string, body: string } }
    value: $steps.fetch_emails.output.messages
```

**Step output `value`** — a `$`-expression that resolves against the raw executor result using the `$result` reference. This maps fields from the executor's raw response into named output keys. Outputs without `value` pass through from the raw result by key name (backwards compatible).

```yaml
outputs:
  title:
    type: string
    value: $result.body.title
```

**Workflow output `value`** — a `$`-expression that resolves from the final runtime context (`$steps`, `$inputs`). This maps step results into the workflow's declared outputs without requiring exit steps.

```yaml
outputs:
  title:
    type: string
    value: $steps.fetch.output.title
```

> **Backwards compatibility.** Runtimes must also accept `source` as an alias for `value` on step inputs, step outputs, and workflow outputs.

**Resolution order:**
1. **Step output `value`**: resolved immediately after the executor returns. A temporary context with `$result` set to the raw executor result is used. The mapped output replaces the raw result in the runtime context.
2. **Workflow output `value`**: resolved after all steps complete, from the final runtime context. If an exit step fires, exit output takes precedence over `value` resolution.

### Expression Language

Expressions appear in `condition` guards, `each` fields, input `value` references, and prompt templates. They are not a programming language. They resolve references and evaluate simple comparisons.

**References:**

| Syntax | Resolves To |
|--------|-------------|
| `$inputs.<name>` | A workflow input parameter |
| `$steps.<id>.output` | The full output of a previous step |
| `$steps.<id>.output.<path>` | A nested field within a step's output (dot notation) |
| `$item` | The current element when inside an `each` iteration |
| `$index` | The current index when inside an `each` iteration |
| `$result` | The raw result of the current step's executor (only valid in step output `value`) |

**Properties:**

| Syntax | Resolves To |
|--------|-------------|
| `<array>.length` | The number of elements in an array |
| `<array>[<expression>]` | Element at index (0-based). Out-of-bounds → `undefined`. The index is a full expression, enabling both literal (`[0]`) and computed (`[$index]`) access. |

**Operators:**

| Category | Operators |
|----------|-----------|
| Comparison | `==`, `!=`, `>`, `<`, `>=`, `<=` |
| Logical | `&&`, `\|\|`, `!` |
| String / Array | `contains` |

`contains` is a binary infix operator. For strings, it tests substring inclusion (case-sensitive). For arrays, it tests whether the array includes the right-hand value (primitive equality). Returns `true` or `false`.

**Constraints.** Expressions cannot assign values, call functions, or produce side effects. They are pure references, property accesses (dot notation and bracket indexing), comparisons, and `contains` tests. No function calls, no ternary expressions, no regex. Use `contains` for substring and array membership tests.

**Template interpolation.** String values containing `${...}` are treated as templates. Each `${ref}` block is evaluated as a reference and its result is spliced into the surrounding string. References inside `${...}` omit the leading `$` (e.g., `${inputs.query}`, `${steps.fetch.output.body}`). If the entire value is a single `${ref}` with no surrounding text, the typed result is preserved (not coerced to string). Use `$${` to produce a literal `${`. Template interpolation applies to `value` fields on step inputs, step outputs, and workflow outputs. Primary use case: constructing dynamic URLs in `each` loops (e.g., `"${inputs.base_url}${item}.json"`).

**Prompt interpolation.** Expressions in `prompt` fields (on LLM steps) follow the same reference resolution rules: `$inputs`, `$steps`, `$item`, and `$index` are resolved and property access works. Comparison and logical operators are not supported in prompt interpolation. The resolved value is coerced to its string representation and inserted at the reference position. Objects and arrays are serialized as JSON. Null values are inserted as the empty string.

### Step Types

| Type | Description |
|------|-------------|
| **Tool** | Invokes a registered tool directly. No LLM involved. Use for any step where the inputs, operation, and expected output shape are known at authoring time. |
| **LLM** | Calls a language model with an explicit prompt. The only step type that consumes tokens. Use for steps requiring judgment, creativity, or natural language understanding. |
| **Transform** | Filters, maps, sorts, or reshapes data. Pure data manipulation inside the runtime. Use to prepare the output of one step as input for the next. |
| **Conditional** | Evaluates a `condition` expression and dispatches to the matching branch. Each branch contains one or more step IDs to execute. Returns the output of the last step in the selected branch. For skipping a single step, use the `condition` common field instead. |
| **Exit** | Terminates the workflow immediately with a status and optional output. Use inside a conditional branch for early termination, or as a circuit breaker when a critical step fails with `on_error: ignore`. |

#### Tool Fields

| Field | Required | Description |
|-------|----------|-------------|
| `tool` | yes | Name of the tool to invoke, as registered in the platform's tool registry (MCP server, function, etc.). |

The step's resolved `inputs` are passed as the tool's arguments. The tool's response becomes the step's output. The runtime does not interpret the response.

#### LLM Fields

| Field | Required | Description |
|-------|----------|-------------|
| `model` | no | Model identifier (e.g., `haiku`, `sonnet`). Falls back to the platform's default model. |
| `prompt` | yes | Prompt template. `$`-prefixed expression references are interpolated before sending to the model. |
| `response_format` | no | Structured output hint passed to models that support it. Not enforced by the runtime in this version. |

#### Transform Fields

| Field | Required | Used With | Description |
|-------|----------|-----------|-------------|
| `operation` | yes | all | One of: `filter`, `map`, `sort`. |
| `where` | yes | filter | Expression evaluated per item. Items where the expression is true are kept. |
| `expression` | yes | map | Object defining the output shape. Each value is an expression resolved per item. |
| `field` | yes | sort | Dot-notation path to the field to sort by. |
| `direction` | no | sort | `asc` (default) or `desc`. |

Transform steps operate on the array provided in their input. The output is the transformed array.

The `where` field is deliberately named differently from the common `condition` guard to avoid ambiguity. The guard decides whether the step runs at all. The `where` clause decides which items survive the filter.

#### Conditional Fields

| Field | Required | Description |
|-------|----------|-------------|
| `condition` | yes | Expression to evaluate. |
| `then` | yes | Array of step IDs to execute if the condition is true. |
| `else` | no | Array of step IDs to execute if the condition is false. |

Steps referenced in `then` and `else` are defined in the main steps array but execute only when their branch is selected. They are skipped during normal sequential execution. The conditional step returns the output of the last step executed in the selected branch.

`each` is not valid on `conditional` steps. If you need to branch per-item, use `each` on the individual steps within each branch. This constraint is enforced at validation time, same as `exit` steps.

#### Exit Fields

| Field | Required | Description |
|-------|----------|-------------|
| `status` | yes | Workflow termination status: `success` or `failed`. |
| `output` | no | Expression or literal value to return as the workflow's final output. |

### Flow Control

| Mechanism | Kind | Purpose |
|-----------|------|---------|
| `condition` | Common field | Guard. Should this step run? Binary skip/execute. |
| `each` | Common field | Iterate. Run this step for every item in a collection. |
| `conditional` | Step type | Branch. Route between different step sequences. |
| `exit` | Step type | Terminate. Stop the workflow early with a status and output. |

## Runtime

A WorkflowSkill runtime is a lightweight execution engine. It reads the workflow YAML, validates the graph, executes each step in sequence, and produces a structured log. It does not reason, plan, or make decisions. Every decision point is resolved by the workflow definition itself: conditions evaluate to true or false, transforms apply declared operations, and LLM steps call a model with an explicit prompt.

### Execution Model

Execution proceeds in two phases.

**Phase 1: Validate.** The runtime parses the workflow YAML, resolves all `$steps` references to verify they form a directed acyclic graph, type-checks input wiring between steps, and confirms that all referenced tools are available. If validation fails, the workflow does not execute. The runtime returns a validation error listing every problem found.

**Phase 2: Execute.** Steps run in declaration order. Each step follows the same lifecycle:

1. **Guard.** Evaluate the `condition` field if present. If false, skip the step, record it as skipped in the run log, and set its output to null.
2. **Resolve inputs.** Evaluate all expression references (`$steps`, `$inputs`) and bind them to the step's declared inputs.
3. **Iterate.** If `each` is present, the step executes once per element in the resolved array. `$item` and `$index` are available within the step. The step's output is an array of per-element results.
4. **Dispatch.** Hand the step to the appropriate executor based on its `type`.
5. **Map outputs.** If any declared output has a `value` field (or its `source` alias), resolve it against the raw executor result using a temporary context where `$result` is set to the raw result. Build a mapped output object from the resolved values. Outputs without `value` pass through by key name.
6. **Validate output.** Check the (mapped) output against the step's declared output schema. If validation fails, treat it as a step failure.
7. **Retry.** If a retry policy is declared and the failure is retriable, re-enter the lifecycle at step 4. Retry respects `max`, `delay`, and `backoff`.
8. **Handle errors.** If the step still failed after all retry attempts, apply the `on_error` policy. `fail` halts the workflow. `ignore` logs the error and continues with null output.
9. **Record.** Write the step's result (status, duration, inputs, outputs, error if any) to the run log.

After the last step completes, the runtime resolves workflow output `value` expressions from the final runtime context. For each declared workflow output with a `value` (or its `source` alias), the expression is evaluated against the final context. If an exit step fired, exit output takes precedence. The runtime emits the complete run log and returns outputs to the caller.

### Step Executors

Each step type has a dedicated executor. The runtime dispatches to the correct one based on the step's `type` field.

**Tool.** Resolves the tool by name from the platform's tool registry (MCP server, registered function, etc.). Passes the step's resolved inputs as the tool's arguments. Returns the tool's response as the step's output. The runtime does not interpret the response.

**LLM.** Resolves the model from the step's `model` field, falling back to a platform default. Constructs the prompt by interpolating expression references in the `prompt` field. Sends the prompt and resolved inputs to the model API. Returns the model's response. The `response_format` field, when present, is passed to models that support structured output as a hint. The runtime does not enforce conformance against it in this version. Output validation relies on the standard step-level schema check.

**Transform.** Applies one of three built-in operations to reshape data between steps. No external calls. No LLM. Pure data manipulation inside the runtime.

| Operation | Description |
|-----------|-------------|
| `filter` | Keep items matching a `where` expression |
| `map` | Reshape each item using an `expression` object |
| `sort` | Order items by a `field` in a given `direction` |

Filter evaluates the `where` expression per item. Items where it returns true are kept:

```yaml
- id: filter_important
  type: transform
  operation: filter
  where: $item.score >= $inputs.min_score
  inputs:
    items: { type: array, value: $steps.score_emails.output }
  outputs:
    items: { type: array }
```

Map projects each item into a new shape. Each value in the `expression` object is resolved per item:

```yaml
- id: extract_fields
  type: transform
  operation: map
  expression:
    repo: $item.repository.name
    author: $item.author.login
    deployed_at: $item.created_at
  inputs:
    items: { type: array, value: $steps.fetch_deploys.output.deployments }
  outputs:
    items: { type: array }
```

Values in a map `expression` can be expression references (`$item.field`), literal values (strings, numbers, booleans), or nested objects where each value follows the same rules. Array construction and computed expressions are not supported. For reshaping that requires building arrays, use multiple transform steps.

Sort orders items by a single field. Defaults to ascending:

```yaml
- id: sort_by_score
  type: transform
  operation: sort
  field: score
  direction: desc
  inputs:
    items: { type: array, value: $steps.filter_important.output.items }
  outputs:
    items: { type: array }
```

**Conditional.** Evaluates the `condition` expression. Executes the steps in the matching branch. Returns the output of the last step executed.

**Exit.** Sets the workflow's final status and output. No further steps execute.

### Error Handling

Error handling is per-step, explicit, and declared at authoring time.

When a step fails, the runtime checks its `on_error` field:

- **`fail`** (default): Halt the workflow. The run log records the failure and all subsequent steps are not attempted. This is the right default because silent failures in unattended workflows are worse than loud ones.
- **`ignore`**: Log the error, set the step's output to null, and continue. Use this for non-critical steps where the workflow can degrade gracefully. Downstream steps that reference the ignored step's output receive null and must handle it (or use a `condition` guard to skip themselves).

When a step declares a `retry` policy, the runtime retries before applying `on_error`. Retries use the step's `max` count, `delay` between attempts, and `backoff` multiplier. Only retriable failures (network errors, rate limits, transient API errors) trigger retries. Validation failures and permanent errors do not.

### Run Log

Every execution produces a structured run log. The log is the primary debugging and observability artifact. It satisfies **PR7: Observability** and **PR8: Traceability**.

The run log contains:

| Field | Description |
|-------|-------------|
| `id` | Unique run identifier |
| `workflow` | Name of the workflow that was executed |
| `status` | Final status: `success` or `failed` |
| `started_at` / `completed_at` | ISO 8601 timestamps |
| `duration_ms` | Total wall-clock time |
| `inputs` | The workflow inputs that were provided |
| `outputs` | The workflow outputs that were produced |
| `steps[]` | Ordered array of step records |
| `summary` | Aggregate counts: steps executed, steps skipped, total tokens, total duration |

Each step record contains:

| Field | Description |
|-------|-------------|
| `id` | The step's declared identifier |
| `executor` | Which executor ran: `tool`, `llm`, `transform`, `conditional`, `exit` |
| `status` | `success`, `failed`, or `skipped` |
| `reason` | Why the step was skipped (if applicable) |
| `duration_ms` | Wall-clock time for this step |
| `iterations` | Number of iterations (if `each` was used) |
| `tokens` | Input and output token counts (LLM steps only) |
| `output` | The step's output (truncated) |
| `error` | Error details (if the step failed) |

Every step is accounted for, including skipped ones. Token usage is isolated to LLM steps. Timing is per-step, so bottlenecks are visible at a glance. When something goes wrong, you look at the run log and see exactly which step failed, what its inputs were, and what error it returned.

### Runtime Boundaries

The runtime executes workflows. Everything else is the platform's responsibility.

| Concern | Handled By |
|---------|------------|
| Tool discovery and registration | MCP / platform registry |
| Model selection defaults | Platform configuration |
| Skill discovery and activation | Agent / platform |
| Scheduling and cron triggers | Platform scheduler |
| Secret management | Platform vault / environment |
| Notification delivery | Platform channels |
| Conversation state and memory | Agent |
| Persistent storage between runs | Platform |

This boundary is deliberate. The runtime stays small by not absorbing platform concerns. Different platforms (OpenClaw, Claude Code, Cursor) can implement the same runtime spec while handling infrastructure differently.

### Conformance

A conformant WorkflowSkill runtime must:

1. Parse and validate workflow YAML before executing any steps.
2. Execute all five step types: tool, llm, transform, conditional, exit.
3. Evaluate `condition` guards and `each` iteration on any step that declares them.
4. Enforce `on_error` semantics: `fail` halts the workflow, `ignore` logs and continues with null output.
5. Execute retry policies respecting `max`, `delay`, and `backoff`.
6. Validate step outputs against declared schemas.
7. Produce a structured run log for every execution, including skipped steps.
8. Reject workflows containing unrecognized step types rather than silently ignoring them.
9. Resolve step output `value` expressions (and their `source` alias) using the `$result` reference after each step's executor returns.
10. Resolve workflow output `value` expressions (and their `source` alias) from the final runtime context after all steps complete, with exit step output taking precedence.

A conformance test suite will accompany the reference implementation (see Adoption Path). The suite provides executable tests for each requirement above, giving platform implementors a concrete target rather than a prose specification to interpret.
