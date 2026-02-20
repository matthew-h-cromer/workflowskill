# Proposal: WorkflowSkill — Deterministic Agent Skill Workflows

## Executive Summary

AI agents can now do real work on your behalf: triage your email, brief you on your calendar, monitor your finances, publish content on a schedule. But there's a problem. Every time one of these automations runs, the agent approaches it like it's never done it before. It reads its instructions from scratch, reasons about what to do, picks its tools, and improvises its way through, even if it ran the exact same job yesterday and will run it again tomorrow.

This makes recurring automations expensive and fragile. A simple daily email triage can cost $4.50/month in AI inference alone. More importantly, results drift between runs. Output that looked fine on Monday gets formatted differently on Tuesday. A step that worked last week gets skipped this week. Users learn not to trust their automations, and many abandon them entirely.

The root cause is a design mismatch. Most of what happens in a repeated workflow doesn't require intelligence at all. Fetching data, filtering a list, formatting a message, deciding where to send it: these are deterministic steps. Only a fraction of the work (scoring an email's importance, summarizing a document, making a judgment call) actually needs an AI model. But today, the entire job runs through one.

WorkflowSkill fixes this by letting authors declare a workflow's plan once. Deterministic steps execute directly through a lightweight runtime with no AI, no cost, and the same result every time. Steps that genuinely require judgment invoke a model, and authors choose which model, so a cheap one handles simple classification while a more capable one handles nuance. Error handling and retries are explicit rather than improvised.

The result: that $4.50/month email triage drops to $0.09. Every run follows the same plan. Behavior is auditable and version-controlled. The automation becomes reliable enough to run while you sleep.

WorkflowSkill is designed as an extension to the existing AgentSkills standard. It lives inside the same file format skills already use. Systems that support it execute workflows directly. Systems that don't still read it as documentation and work as they always have. Nothing breaks. Adoption is incremental.

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

A bottom-up survey of actual use cases makes the scope clear. A recent analysis of the top 10 ways people run autonomous agents identified: email triage, daily briefings, calendar management, content research pipelines, developer workflow automation, finance tracking, smart home automation, research and shopping, meal planning, and personal knowledge management. Nine of those ten are multi-step workflows, tasks with a defined sequence of fetch, process, filter, and deliver steps that follow the same pattern every run. Only the personal knowledge base (primarily retrieval, not orchestration) sits outside that pattern.

The supply side confirms this. Of ClawHub's ~3,300 legitimate skills, the Productivity category alone represents 25% of the registry and is explicitly described as "email automation and workflow optimization." Business skills (4.6%) are described as "enterprise workflow solutions." Development skills (29.7%) are where CI/CD pipelines, deployment automation, and monitoring workflows live. Accounting for overlap, roughly 35–50% of meaningfully used skills involve multi-step orchestration rather than single-tool API documentation. The emergence of flowmind is further evidence: a meta-skill whose sole purpose is chaining other skills into repeatable sequences, built by the community because the platform didn't yet have a solution.

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

This is not to mention the possibility of purely deterministic workflows (backups, aggregation, rule based handling, etc.) which may not use an LLM at all.

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
      <name>: { type: string|int|float|boolean|array|object, default: <value> }
    outputs:
      <name>: { type: string|int|float|boolean|array|object }
    # type-specific fields
    # flow control fields
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

### Step Types

| Type | Description |
|------|-------------|
| **Tool** | Invokes a registered tool directly. No LLM involved. Use for any step where the inputs, operation, and expected output shape are known at authoring time. |
| **LLM** | Calls a language model with an explicit prompt. The only step type that consumes tokens. Use for steps requiring judgment, creativity, or natural language understanding. |
| **Transform** | Filters, maps, sorts, or reshapes data. Pure data manipulation inside the runtime. Use to prepare the output of one step as input for the next. |
| **Conditional** | Evaluates a `condition` expression and dispatches to the matching branch. Each branch contains one or more step IDs to execute. Returns the output of the last step in the selected branch. For skipping a single step, use the `condition` common field instead. |
| **Exit** | Terminates the workflow immediately with a status and optional output. Use inside a conditional branch for early termination, or as a circuit breaker when a critical step fails with `on_error: ignore`. |

### Flow Control

| Mechanism | Kind | Purpose |
|-----------|------|---------|
| `condition` | Common field | Guard. Should this step run? Binary skip/execute. |
| `each` | Common field | Iterate. Run this step for every item in a collection. |
| `conditional` | Step type | Branch. Route between different step sequences. |
| `exit` | Step type | Terminate. Stop the workflow early with a status and output. |

## Runtime

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
