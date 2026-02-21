# Proposal: WorkflowSkill — Deterministic Agent Skill Workflows

## Contents

- [Executive Summary](#executive-summary)
- [Why Now](#why-now)
- [Context](#context)
- [Problem Statement](#problem-statement)
- [Proposal](#proposal)
- [WorkflowSkill](#workflowskill)
- [Runtime](#runtime)
- [Usage](#usage)
- [Alternatives](#alternatives)
- [Security Considerations](#security-considerations)
- [Adoption Path](#adoption-path)
- [Future Work](#future-work)

## Executive Summary

AI agents can now do real work on your behalf: triage your email, brief you on your calendar, monitor your finances, publish content on a schedule. But there's a problem. Every time one of these automations runs, the agent approaches it like it's never done it before. It reads its instructions from scratch, reasons about what to do, picks its tools, and improvises its way through, even if it ran the exact same job yesterday and will run it again tomorrow.

This makes recurring automations expensive and fragile. A simple daily email triage can cost $4.50/month in AI inference alone. More importantly, results drift between runs. Output that looked fine on Monday gets formatted differently on Tuesday. A step that worked last week gets skipped this week. Users learn not to trust their automations, and many abandon them entirely.

The root cause is a design mismatch. Most of what happens in a repeated workflow doesn't require intelligence at all. Fetching data, filtering a list, formatting a message, deciding where to send it: these are deterministic steps. Only a fraction of the work (scoring an email's importance, summarizing a document, making a judgment call) actually needs an AI model. But today, the entire job runs through one.

WorkflowSkill fixes this by letting authors declare a workflow's plan once. Deterministic steps execute directly through a lightweight runtime with no AI, no cost, and the same result every time. Steps that genuinely require judgment invoke a model, and authors choose which model, so a cheap one handles simple classification while a more capable one handles nuance. Error handling and retries are explicit rather than improvised.

The result: that $4.50/month email triage drops to $0.09. Every run follows the same plan. Behavior is auditable and version-controlled. The automation becomes reliable enough to run while you sleep.

WorkflowSkill is designed as an extension to the existing AgentSkills standard. It lives inside the same file format skills already use. Systems that support it execute workflows directly. Systems that don't still read it as documentation and work as they always have. Nothing breaks. Adoption is incremental.

## Why Now

The AgentSkill standard has crossed the adoption threshold. 27+ agent products implement it. ClawHub hosts over 10,700 skills. The community is already building workflow tooling on its own: flowmind chains skills into repeatable sequences, Lobster adds a typed pipeline shell. The gap between "skills as documentation" and "skills as executable programs" is visible and felt.

Three signals indicate this is the right moment:

**Critical mass.** The standard is adopted widely enough that a workflow extension benefits the entire ecosystem, not one platform. A format that works across Claude Code, Codex, Cursor, Gemini CLI, and OpenClaw is worth standardizing. A format that works in one of those is a feature.

**Proven demand.** Community-built tools validate the need. flowmind exists because users wanted to chain skills into sequences and the platform didn't support it. Lobster exists because OpenClaw needed typed pipelines with approval gates. These are independent implementations of the same idea: structured, repeatable execution of multi-step workflows.

**Compounding waste.** As agent platforms add scheduling and cron support, more workflows run unattended. Every new cron job multiplies the cost of full LLM orchestration. The problem isn't theoretical. OpenClaw users report $47/week in API costs for routine automations. The longer the ecosystem waits to address this, the more money burns.

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

## Problem Statement

### Workflows Are Misaligned As Skills

The AgentSkills specification identifies four primary use cases: domain expertise, new capabilities, repeatable workflows, and interoperability. Three of those four are essentially static. You load the skill and the agent can perform a variety of tasks. But workflows are different.

Repeatable workflows run on schedules. They run unattended. They run dozens or hundreds of times. And right now, every run uses an expensive orchestrator that takes creative freedom at every turn rather than the just specific step where you actually need inference.

This is a structural misalignment. Any agent platform that implements the AgentSkills spec, allows skills to define workflows, and uses LLM orchestration to execute them is going to face problems around cost and reliability.

### Workflows Are Prevalent

Nine of the top ten autonomous agent use cases are multi-step workflows. A recent analysis identified: email triage, daily briefings, calendar management, content research pipelines, developer workflow automation, finance tracking, smart home automation, research and shopping, and meal planning. Each follows the same pattern: fetch data, process it, filter or transform it, deliver a result. Only the personal knowledge base (primarily retrieval, not orchestration) sits outside that pattern.

The supply side confirms this. Of ClawHub's ~3,300 legitimate skills, the Productivity category (25% of the registry) is explicitly described as "email automation and workflow optimization." Business skills (4.6%) are "enterprise workflow solutions." Development skills (29.7%) contain CI/CD pipelines, deployment automation, and monitoring workflows. Accounting for overlap, roughly 35-50% of meaningfully used skills involve multi-step orchestration rather than single-tool API documentation.

The emergence of flowmind makes the gap concrete: a meta-skill whose sole purpose is chaining other skills into repeatable sequences, built by the community because the platform didn't have a solution.

Workflows aren't an edge case in the AgentSkills ecosystem. They're the primary use case.

### The Cost Problem

Any time an agent is executing a workflow, it runs a full LLM session. The agent reads one or more SKILL.md files, reasons about which tools to call, executes them, processes the results, and formats the output. The more times a workflow is executed, the more the cost of doing it this way will compound. The problem isn't that LLMs are expensive. It's that most of that spending is waste.

Consider a daily email triage of 20 emails:

| Step | What Happens | Tokens |
|------|-------------|--------|
| 1: Session Init | Agent reads SKILL.md instructions | ~500 |
| 2: Tool Selection | LLM reasons about which tool to call | ~200 |
| 3: Tool Execution | gmail.search called, results returned | ~800 |
| 4: Per-Email Processing | LLM scores/summarizes each email | ~300 × 20 = 6,000 |
| 5: Output Formatting | LLM formats the final briefing | ~400 |
| 6: Notification Decision | LLM decides how to notify | ~200 |
| **Total per run** | | **~8,000–12,000** |
| **Monthly (daily cron for 30 days)** | | **~300,000** |

In this example, only step 4 is doing work that truly requires an LLM. Being able to perform the rest of the steps without an LLM would eliminate 26% of the cost. For workflows that have heavier orchestration relative to the actual LLM work, savings will be even more.

We start to see truly massive cost savings when we consider customizing which model we use per step:

|  | Current | WorkflowSkill | Reduction |
|--|---------|--------------|-----------|
| LLM steps | 6 | 1 | 83% fewer |
| Tokens per run | ~8,100 | ~6,000 | 26% fewer |
| Model | Sonnet ($15/M output) | Haiku ($1.25/M output) | 12x cheaper per token |
| Cost per run | ~$0.15 | ~$0.003 | 98% cheaper |
| Monthly (30x) | ~$4.50 | ~$0.09 | $4.41 saved per month |

In this example, it means we may choose to use Haiku over Sonnet. In that instance given Haiku is 12x cheaper per token, we would eliminate more like 98% of the cost.

Now consider a second case: the deployment report from Example 2. This workflow fetches deployments, filters to production, sorts by time, and posts to Slack. It requires zero judgment. But without WorkflowSkill, an LLM orchestrates every step:

| Step | What Happens | Tokens |
|------|-------------|--------|
| 1: Session Init | Agent reads SKILL.md instructions | ~500 |
| 2: Tool Selection | LLM reasons about which GitHub API to call | ~200 |
| 3: Tool Execution | github.list_deployments called, results returned | ~600 |
| 4: Result Interpretation | LLM reads and filters to production | ~800 |
| 5: Formatting | LLM formats the Slack message | ~400 |
| 6: Delivery Decision | LLM decides where to send it | ~200 |
| **Total per run** | | **~2,700** |
| **Monthly (daily cron for 30 days)** | | **~81,000** |

At Sonnet pricing ($15/M output tokens): ~$1.22/month. With WorkflowSkill: $0.00. Every token was waste. No step in this workflow requires inference. Multiply by the number of similar automations a team runs (deployment reports, backup confirmations, status aggregations, alert routing) and the savings are substantial.

This is not to mention the possibility of purely deterministic workflows (backups, aggregation, rule-based handling, etc.) which may not use an LLM at all.

### The Reliability Problem

When an LLM orchestrates a workflow, it improvises. It reads the SKILL.md and decides, in that moment, with that context window, at that temperature, which tools to call, in what order, with what arguments. Most of the time it gets it right. But *most of the time* is not a property you want in a system running unattended on a schedule, with real cost tied to its performance.

Some examples: The LLM might format output differently on Tuesday than Monday, breaking a downstream parser. It might decide to skip a step that seems redundant but isn't. It might handle a failed tool call by apologizing in the notification rather than retrying. It might start troubleshooting and drift from the original objective completely. None of these are bugs in the LLM. They are the natural consequence of using a probabilistic system to orchestrate a deterministic job.

Security researchers studying the OpenClaw ecosystem note that users routinely abandon cron-based automations after unpredictable behavior and revert to manual workflows. The top use case guides for the platform explicitly warn readers to "start supervised before granting autonomy," because the field has learned that unsupervised LLM-orchestrated workflows drift.

Troubleshooting makes the problem concrete. When a skill-based workflow misbehaves, you have two fuzzy inputs: the intent written in the skill and the intent inferred from the execution transcript. Neither is precise. Comparing them to find root cause is interpretive work, and so is the fix you design. A deterministic workflow changes this entirely. Behavior is measurable against explicit expectations. The gap between what should have happened and what did happen is visible, not inferred. Building and iterating on explicit definitions is a fundamentally different class of problem, and a much easier one. Each iteration moves your automation toward a concrete outcome rather than drifting around one.

WorkflowSkill addresses this at the architectural level. The execution path is declared, not improvised. Error handling is explicit: retry with backoff, fail-or-ignore semantics per step. Every run follows the same plan. That plan can be read, audited, version-controlled, and tested before it touches production systems. When something goes wrong, you have a structured run log with step-level timing and failure reasons, not a transcript to synthesize.

The result is automation that is trustworthy enough to run while you are asleep.

## Proposal

The following proposal seeks to satisfy these requirements:

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
  <name>: { type: string|int|float|boolean|array|object }
steps:
  - id: string
    type: tool|llm|transform|conditional|exit
    description: string
    inputs:
      <name>: { type: <type>, source: <expression>, default: <value> }
    outputs:
      <name>: { type: <type> }

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
      delay: string
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
| inputs | yes | Schema declaring what this step expects, with type and source for each field. |
| outputs | yes | Schema declaring what this step produces. |
| condition | no | Boolean expression. If false, the step is skipped and its output is null. This is a guard clause. Use it for "run this step only if X." For routing between different paths, use a `conditional` step instead. |
| each | no | Expression resolving to an array. The step executes once per element; output is an array of results. `$item` and `$index` are available within the step. Not valid on `exit` steps; rejected at validation time. |
| on_error | no | Error handling strategy: `fail` (default) or `ignore` (log the error and continue with null output). |
| retry | no | Retry policy: `{ max: int, delay: string, backoff: float }`. |

### Step Inputs and Outputs

Every step declares typed inputs and outputs. This serves three purposes:

**Pre-execution validation.** Before executing any steps, the runtime walks the step graph and verifies that every input resolves to a source with a compatible type. A wiring error like passing a string where an array is expected is caught before anything runs.

**Post-step validation.** After each step executes, the runtime validates its actual output against the declared schema. A step that produces unexpected output fails explicitly rather than silently corrupting downstream steps.

**Composability contracts.** When workflow composition is supported (see Future Work), input and output schemas are validated across the boundary between parent and child workflows.

```yaml
inputs:
  messages:
    type: array
    items: { type: object, properties: { from: string, subject: string, body: string } }
    source: $steps.fetch_emails.output.messages
```

```yaml
outputs:
  scored:
    type: array
    items: { type: object, properties: { score: int, summary: string } }
```

### Expression Language

Expressions appear in `condition` guards, `each` fields, input `source` references, and prompt templates. They are not a programming language. They resolve references and evaluate simple comparisons.

**References:**

| Syntax | Resolves To |
|--------|-------------|
| `$inputs.<name>` | A workflow input parameter |
| `$steps.<id>.output` | The full output of a previous step |
| `$steps.<id>.output.<path>` | A nested field within a step's output (dot notation) |
| `$item` | The current element when inside an `each` iteration |
| `$index` | The current index when inside an `each` iteration |

**Properties:**

| Syntax | Resolves To |
|--------|-------------|
| `<array>.length` | The number of elements in an array |

**Operators:**

| Category | Operators |
|----------|-----------|
| Comparison | `==`, `!=`, `>`, `<`, `>=`, `<=` |
| Logical | `&&`, `\|\|`, `!` |

**Constraints.** Expressions cannot assign values, call functions, or produce side effects. They are pure references, property accesses, and comparisons.

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
5. **Validate output.** Check the executor's return value against the step's declared output schema. If validation fails, treat it as a step failure.
6. **Handle errors.** If the step failed, apply the `on_error` policy. `fail` halts the workflow. `ignore` logs the error and continues with null output.
7. **Retry.** If a retry policy is declared and the failure is retriable, re-enter the lifecycle at step 4. Retry respects `max`, `delay`, and `backoff`.
8. **Record.** Write the step's result (status, duration, inputs, outputs, error if any) to the run log.

After the last step completes, the runtime validates the workflow's outputs against the declared output schema, emits the complete run log, and returns outputs to the caller.

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
    items: { type: array, source: $steps.score_emails.output }
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
    items: { type: array, source: $steps.fetch_deploys.output.deployments }
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
    items: { type: array, source: $steps.filter_important.output.items }
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

A conformance test suite will accompany the reference implementation (see Adoption Path). The suite provides executable tests for each requirement above, giving platform implementors a concrete target rather than a prose specification to interpret.

## Usage

The spec above defines every piece of the WorkflowSkill format. This section puts them together into complete, runnable workflows. Each example is a `workflow` block that would appear inside a SKILL.md file.

### Example 1: Daily Email Triage

This is the email triage workflow referenced throughout the Problem Statement. It fetches unread emails, uses an LLM to score each one for importance, filters and sorts the results, and posts a briefing to Slack. One LLM step, using a cheap model. Everything else is deterministic.

Five of the seven steps consume zero tokens. The LLM step uses Haiku for simple classification work. Monthly cost: ~$0.09 instead of ~$4.50.

```yaml
```workflow
inputs:
  max_results:
    type: int
    default: 20
  min_score:
    type: int
    default: 7

outputs:
  briefing:
    type: object
    properties:
      important_count: { type: int }
      emails: { type: array }

steps:
  - id: fetch_emails
    type: tool
    description: Fetch unread emails from the last 24 hours
    tool: gmail.search
    inputs:
      query:
        type: string
        default: "is:unread newer_than:1d"
      max_results:
        type: int
        source: $inputs.max_results
    outputs:
      messages:
        type: array
    retry:
      max: 3
      delay: "2s"
      backoff: 2.0

  - id: score_emails
    type: llm
    description: Score each email for importance and summarize
    model: haiku
    prompt: |
      Score this email from 1 to 10 for importance based on sender,
      subject, and urgency. Provide a one-sentence summary.

      From: $item.from
      Subject: $item.subject
      Body: $item.body

      Respond as JSON: { "from": "<sender>", "subject": "<subject>",
      "score": <1-10>, "summary": "<string>" }
    response_format:
      type: object
      properties:
        from: { type: string }
        subject: { type: string }
        score: { type: int }
        summary: { type: string }
    each: $steps.fetch_emails.output.messages
    inputs:
      email:
        type: object
        source: $item
    outputs:
      from: { type: string }
      subject: { type: string }
      score: { type: int }
      summary: { type: string }

  - id: filter_important
    type: transform
    description: Keep emails scoring at or above the threshold
    operation: filter
    where: $item.score >= $inputs.min_score
    inputs:
      items:
        type: array
        source: $steps.score_emails.output
    outputs:
      items: { type: array }

  - id: sort_by_score
    type: transform
    description: Sort by score, highest first
    operation: sort
    field: score
    direction: desc
    inputs:
      items:
        type: array
        source: $steps.filter_important.output.items
    outputs:
      items: { type: array }

  - id: exit_if_none
    type: exit
    description: Nothing important today
    condition: $steps.sort_by_score.output.items.length == 0
    status: success
    output:
      important_count: 0
      emails: []

  - id: format_briefing
    type: transform
    description: Shape the final output
    operation: map
    expression:
      from: $item.from
      subject: $item.subject
      score: $item.score
      summary: $item.summary
    inputs:
      items:
        type: array
        source: $steps.sort_by_score.output.items
    outputs:
      items: { type: array }

  - id: send_briefing
    type: tool
    description: Post the daily briefing to Slack
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#daily-briefing"
      blocks:
        type: array
        source: $steps.format_briefing.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore
```
```

| Step | Type | Tokens | Purpose |
|------|------|--------|---------|
| fetch_emails | tool | 0 | Fetch data from Gmail |
| score_emails | llm | ~300 x 20 | Score and summarize each email |
| filter_important | transform | 0 | Keep emails above threshold |
| sort_by_score | transform | 0 | Order by importance |
| exit_if_none | exit | 0 | Short-circuit if nothing matters |
| format_briefing | transform | 0 | Shape the output |
| send_briefing | tool | 0 | Deliver to Slack |

### Example 2: Deployment Report (Zero LLM Tokens)

Not every workflow needs an LLM. This one fetches recent deployments from GitHub, filters to production, sorts by time, and posts a summary to Slack. Every step is deterministic. Total token cost: zero.

This is the class of workflow (backups, aggregation, rule-based routing) that currently runs through a full LLM session for no reason.

```yaml
```workflow
inputs:
  repo:
    type: string
  hours:
    type: int
    default: 24

outputs:
  report:
    type: object
    properties:
      count: { type: int }
      deployments: { type: array }

steps:
  - id: fetch_deploys
    type: tool
    description: Get recent deployments
    tool: github.list_deployments
    inputs:
      repo:
        type: string
        source: $inputs.repo
      since:
        type: string
        default: "24h"
    outputs:
      deployments: { type: array }
    retry:
      max: 3
      delay: "5s"
      backoff: 2.0

  - id: filter_production
    type: transform
    description: Keep only production deployments
    operation: filter
    where: $item.environment == "production"
    inputs:
      items:
        type: array
        source: $steps.fetch_deploys.output.deployments
    outputs:
      items: { type: array }

  - id: exit_if_none
    type: exit
    description: Nothing deployed
    condition: $steps.filter_production.output.items.length == 0
    status: success
    output:
      count: 0
      deployments: []

  - id: sort_recent
    type: transform
    description: Most recent first
    operation: sort
    field: created_at
    direction: desc
    inputs:
      items:
        type: array
        source: $steps.filter_production.output.items
    outputs:
      items: { type: array }

  - id: format_report
    type: transform
    description: Extract the fields we care about
    operation: map
    expression:
      repo: $item.repository.name
      sha: $item.sha
      author: $item.creator.login
      status: $item.state
      deployed_at: $item.created_at
    inputs:
      items:
        type: array
        source: $steps.sort_recent.output.items
    outputs:
      items: { type: array }

  - id: post_to_slack
    type: tool
    description: Send the report
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#deployments"
      blocks:
        type: array
        source: $steps.format_report.output.items
    outputs:
      ok: { type: boolean }
```
```

Six steps. Zero tokens. The runtime executes this in a fraction of a second with no model calls. Compare that to an LLM reading a SKILL.md, reasoning about which GitHub API to call, interpreting the response, formatting a message, and deciding where to send it.

### Example 3: Content Moderation (Conditional Branching)

This workflow demonstrates the `conditional` step type for routing between different execution paths. New posts are evaluated against community guidelines. If any high-severity violations are found, those posts are removed automatically and moderators are notified. Otherwise, flagged posts are queued for human review.

```yaml
```workflow
inputs:
  channel_id:
    type: string

outputs:
  result:
    type: object
    properties:
      evaluated: { type: int }
      auto_removed: { type: int }
      queued_for_review: { type: int }

steps:
  - id: fetch_posts
    type: tool
    description: Get new posts from the last hour
    tool: community.list_recent_posts
    inputs:
      channel_id:
        type: string
        source: $inputs.channel_id
      since:
        type: string
        default: "1h"
    outputs:
      posts: { type: array }

  - id: exit_if_none
    type: exit
    description: No new posts
    condition: $steps.fetch_posts.output.posts.length == 0
    status: success
    output:
      evaluated: 0
      auto_removed: 0
      queued_for_review: 0

  - id: evaluate_posts
    type: llm
    description: Check each post against community guidelines
    model: haiku
    prompt: |
      Evaluate this post against community guidelines.
      Flag violations for: harassment, spam, misinformation,
      illegal content.

      Post by $item.author: $item.body

      Respond as JSON: { "post_id": "<id>", "severity": "none|low|high",
      "reason": "<explanation or empty string>" }
    response_format:
      type: object
      properties:
        post_id: { type: string }
        severity: { type: string }
        reason: { type: string }
    each: $steps.fetch_posts.output.posts
    inputs:
      post:
        type: object
        source: $item
    outputs:
      post_id: { type: string }
      severity: { type: string }
      reason: { type: string }

  - id: filter_violations
    type: transform
    description: Keep only posts that were flagged
    operation: filter
    where: $item.severity != "none"
    inputs:
      items:
        type: array
        source: $steps.evaluate_posts.output
    outputs:
      items: { type: array }

  - id: exit_if_clean
    type: exit
    description: All posts are clean
    condition: $steps.filter_violations.output.items.length == 0
    status: success
    output:
      evaluated: $steps.fetch_posts.output.posts.length
      auto_removed: 0
      queued_for_review: 0

  - id: filter_high_severity
    type: transform
    operation: filter
    where: $item.severity == "high"
    inputs:
      items:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      items: { type: array }

  - id: filter_low_severity
    type: transform
    operation: filter
    where: $item.severity == "low"
    inputs:
      items:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      items: { type: array }

  - id: route_by_severity
    type: conditional
    description: Urgent alert vs. routine summary
    condition: $steps.filter_high_severity.output.items.length > 0
    then: [auto_remove, send_urgent_alert]
    else: [send_summary]

  - id: auto_remove
    type: tool
    description: Remove high-severity posts immediately
    tool: community.remove_posts
    each: $steps.filter_high_severity.output.items
    inputs:
      post_id:
        type: string
        source: $item.post_id
      reason:
        type: string
        source: $item.reason
    outputs:
      removed: { type: boolean }

  - id: send_urgent_alert
    type: tool
    description: Urgent alert to the moderation team
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#moderation-urgent"
      blocks:
        type: array
        source: $steps.filter_high_severity.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore

  - id: send_summary
    type: tool
    description: Routine summary when nothing critical
    tool: slack.post_message
    inputs:
      channel:
        type: string
        default: "#moderation-log"
      blocks:
        type: array
        source: $steps.filter_violations.output.items
    outputs:
      ok: { type: boolean }
    on_error: ignore

  - id: queue_for_review
    type: tool
    description: Queue low-severity posts for human review
    condition: $steps.filter_low_severity.output.items.length > 0
    tool: community.queue_review
    each: $steps.filter_low_severity.output.items
    inputs:
      post_id:
        type: string
        source: $item.post_id
      reason:
        type: string
        source: $item.reason
    outputs:
      queued: { type: boolean }
```
```

The conditional step at `route_by_severity` is the key. If any high-severity violations exist, the workflow auto-removes those posts and sends an urgent alert to moderators. If all violations are low-severity, moderators get a routine summary instead. The routing logic is declared and auditable, not improvised by the LLM at runtime.

The `queue_for_review` step sits outside the conditional. It uses a `condition` guard to check whether low-severity posts exist, and runs regardless of which branch the conditional took. This means low-severity posts are always queued for human review, whether or not high-severity posts were also found in the same batch.

## Alternatives

A natural question: why define a new workflow format when existing tools already orchestrate AI workflows?

| Approach | What It Is | Why It Doesn't Fill This Gap |
|----------|-----------|------------------------------|
| **LangGraph** | Graph-based workflow orchestration for LLM applications | Framework-specific. Python-only. Requires writing code, not declaring a plan. Not a standard that multiple agents can consume. |
| **CrewAI** | Role-based multi-agent coordination | Solves a different problem: agent teams, not repeatable workflows. Every run still involves full LLM orchestration. |
| **Temporal / Prefect / Airflow** | Production workflow engines | Designed for infrastructure-scale orchestration (data pipelines, deployment automation). Require a runtime server, worker processes, and operational investment far beyond what an agent skill needs. Different abstraction level entirely. |
| **Haystack** | Python pipeline framework for LLM applications | Validates the core thesis: Haystack separates deterministic and LLM steps and achieves the lowest token usage among comparable frameworks. But it is a framework, not a standard. Python-only, code-first. A single agent platform could use Haystack internally; the ecosystem cannot standardize on it. |
| **Lobster** | OpenClaw's built-in typed workflow shell for composing tools into pipelines | The closest existing solution and strong validation of the problem. Lobster is a shell-style pipeline engine (exec, where, pick, pipe) with approval gates and typed data. But it is OpenClaw-specific, not a cross-platform standard. It cannot be consumed by Claude Code, Cursor, Codex, or any other agent. A standard that lives inside AgentSkill lets every platform benefit, including OpenClaw. |
| **flowmind** | Community-built OpenClaw meta-skill for chaining skills into sequences | Proves the demand. Users built this because the platform didn't have a solution. WorkflowSkill is the standardized answer: typed inputs/outputs, error handling, run logs, and a spec that any platform can implement. |

The common thread: every existing approach is either a framework (tied to one language, one runtime, one ecosystem) or an infrastructure tool (too heavy for agent skills). None of them are a portable, declarative format that lives inside an existing skill file and works across 27+ agent products.

WorkflowSkill is not competing with LangGraph or Temporal. It operates at a different layer. A LangGraph application could invoke a WorkflowSkill. A Temporal workflow could trigger one. The goal is not to replace orchestration frameworks but to give the skills layer a standard way to declare what should happen, so that the execution can be deterministic where possible and intelligent only where necessary.

## Security Considerations

WorkflowSkill changes the trust model for skill execution. Today, an LLM mediates every tool call: it reads the skill instructions, decides which tools to invoke, and the platform can inspect the LLM's reasoning before allowing execution. A WorkflowSkill runtime executes tool calls directly, without LLM mediation. This is the source of its performance advantage, but it also means the workflow definition itself becomes the security boundary.

Three properties of the design mitigate this:

**The workflow is auditable.** Every tool call, every input source, and every conditional path is declared in YAML and can be reviewed before the workflow runs. There is no hidden logic. A security review of a WorkflowSkill is a review of a data file, not an interpretation of what an LLM might decide to do.

**The runtime has no capabilities of its own.** It can only invoke tools that the platform has already registered and authorized. If a tool requires elevated permissions, the platform's existing authorization model controls access. The runtime does not bypass tool-level security.

**The capabilities proposal (#170) applies directly.** The active AgentSkill proposal for declaring required capabilities (`shell`, `filesystem`, `network`, `browser`) works with WorkflowSkill without modification. A WorkflowSkill that calls `gmail.search` and `slack.post_message` declares `network` capability. The platform enforces this before the runtime starts.

The remaining risk is malicious workflow definitions: a skill that declares a workflow wiring sensitive data to an exfiltration endpoint. This is the same class of risk that exists today with malicious SKILL.md instructions (see the ClawHavoc campaign and CVE-2026-25253). The mitigation is the same: skill vetting, capability declarations, and platform-level tool authorization. WorkflowSkill makes this review easier, not harder, because the data flow is explicit rather than inferred from natural language instructions.

## Adoption Path

Adoption is centered on building a working implementation and proving the spec in production before proposing it for formal standardization.

**Phase 1: Reference runtime.** Build a WorkflowSkill runtime as an OpenClaw module. OpenClaw is the right starting point: the largest open-source agent platform (196k+ stars), full AgentSkill support, an active community already building workflow tools (flowmind, Lobster), and the exact pain points described in this RFC documented in their issue tracker. The reference runtime implements the full spec: all five step types, expression evaluation, error handling, retry policies, and structured run logs.

**Phase 2: Community feedback.** Run real workflows in production on OpenClaw. Publish results: cost comparisons, reliability metrics, authoring experience. Gather feedback from workflow authors and platform maintainers. Iterate on the spec where real usage reveals gaps or unnecessary complexity.

**Phase 3: Formal proposal.** Submit the refined WorkflowSkill extension to the AgentSkill working group under AAIF / Linux Foundation governance. The reference implementation and production data serve as evidence of viability. The goal is inclusion in the AgentSkill specification, not a competing standard.

**Phase 4: Conformance test suite.** Once the spec is stable and accepted, publish a platform-agnostic test suite that any runtime can run to verify compliance. Tests cover step type execution, expression resolution, error handling semantics, conditional branching, iteration, and run log format. The suite is what makes cross-platform adoption practical: the OpenClaw module is one implementation, the tests define correctness.

This path is deliberately incremental. It does not require any existing platform to change anything until they choose to adopt the extension. It does not fork the ecosystem. And it produces a working implementation before asking for standardization.

## Future Work

The following capabilities are considered for inclusion once the core specification has proven its value in production.

**Approval gates.** Pause execution and wait for human authorization before high-stakes steps. This is the most architecturally complex addition: it requires state serialization, process suspension and resumption, a notification contract with the platform, and timeout handling. It is also the only feature that forces the runtime to maintain state across process boundaries. Every other executor is fire-and-forget within a single run.

**Workflow composability.** Invoke one WorkflowSkill as a step within another, with typed inputs and outputs validated across the boundary. This requires scoping rules for child workflows, nested run log merging, and cross-skill versioning semantics. Composability becomes valuable once the community has built a critical mass of standalone workflows to compose.

**Fallback paths.** Declare alternative step definitions that execute when a primary step fails. More expressive than `on_error: ignore` because the fallback can take a completely different action rather than continuing with null output.

**Loop step type.** Repeat-until patterns for polling, convergence, and retry-with-adaptation. The `each` field handles iteration over known collections. The loop step addresses cases where the number of iterations isn't known in advance: waiting for an API to return a specific status, refining output until a quality threshold is met, or retrying with modified parameters.

**Extended transform operations.** `pick` (select specific fields from an object), `format` (interpolate values into a string template), `group`, `flatten`, `merge`, `concat`, `count`, and `unique`. The initial three operations (filter, map, sort) are orthogonal primitives that cover the majority of data reshaping needs. `pick` is a special case of `map`. `format` duplicates what the expression language already provides in prompt templates. Additional operations will be added based on demand from real workflows.

**Expression extensions.** Null coalescing (`??`) for handling missing data from skipped steps, and the `in` operator for set membership checks. Both are deferred until real usage patterns clarify their semantics and interaction with the error handling model.

**Run log verbosity levels.** Configurable detail levels: minimal (timing and status only), standard (current default), and debug (full untruncated inputs and outputs). Useful for production storage optimization and detailed troubleshooting respectively.

**Structured output enforcement.** Strict validation of LLM responses against declared `response_format` schemas. Deferred because LLM output validation is inherently messy (partial conformance, model-specific structured output support varies), and the failure modes need to be understood before enforcement semantics are specified.

**Parallel execution.** Steps execute sequentially in declaration order. Some workflows contain independent branches that could run concurrently. A future version may introduce parallel execution groups or automatic parallelism based on dependency analysis. Deferred because the sequential model is simpler to reason about, debug, and log, and because the performance bottleneck in most workflows is external API latency rather than step sequencing.

**Spec versioning.** A `version` field on the workflow block declaring which spec version the workflow was written against. This becomes necessary when new step types, expression operators, or execution semantics are added. Deferred from the initial spec to avoid premature versioning before the format stabilizes through real usage.

**Workflow registry.** A package registry for published WorkflowSkills, with semantic versioning, dependency resolution, and discoverability. This is what turns WorkflowSkill from a format into an ecosystem. ClawHub already hosts 10,700+ skills, but they are flat files with no versioning, no dependency graph, and no composability contract. A registry changes that. A team publishes `email-triage@1.2.0`. Another team builds `morning-briefing@1.0.0` that depends on it. When `email-triage` ships a breaking change, semver catches it. When a user searches for "slack notification," they find a tested, versioned workflow they can drop into their own composition. This is the pattern that made npm the engine of the Node ecosystem: small, composable, versioned packages that build on each other. Spec versioning is the prerequisite. Workflow composability (invoking one WorkflowSkill as a step in another) is the enabling feature. The registry is where the compounding value lives. Deferred because it requires both of those foundations, plus decisions about hosting, namespacing, trust verification, and governance that should be informed by real community usage rather than designed in advance.
