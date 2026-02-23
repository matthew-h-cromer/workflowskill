# Proposal: WorkflowSkill — Deterministic Agent Skill Workflows

> **Related documents:** [Specification](SPEC.md) | [Examples](examples/)

## Contents

- [Executive Summary](#executive-summary)
- [Why Now](#why-now)
- [Problem Statement](#problem-statement)
- [Alternatives](#alternatives)
- [Security Considerations](#security-considerations)
- [Adoption Path](#adoption-path)
- [Future Work](#future-work)
- [Appendix: Use Case Taxonomy](#appendix-use-case-taxonomy)

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

## Problem Statement

### Workflows Are Misaligned As Skills

The AgentSkills specification identifies four primary use cases: domain expertise, new capabilities, repeatable workflows, and interoperability. Three of those four are essentially static. You load the skill and the agent can perform a variety of tasks. But workflows are different.

Repeatable workflows run on schedules. They run unattended. They run dozens or hundreds of times. And right now, every run uses an expensive orchestrator that takes creative freedom at every turn rather than the just specific step where you actually need inference.

This is a structural misalignment. Any agent platform that implements the AgentSkills spec, allows skills to define workflows, and uses LLM orchestration to execute them is going to face problems around cost and reliability.

### Workflows Are Prevalent

Nine of the top ten autonomous agent use cases are multi-step workflows. A recent analysis identified: email triage, daily briefings, calendar management, content research pipelines, developer workflow automation, finance tracking, smart home automation, research and shopping, and meal planning. Each follows the same pattern: fetch data, process it, filter or transform it, deliver a result. Only the personal knowledge base (primarily retrieval, not orchestration) sits outside that pattern.

But the pattern extends well beyond developer and enterprise contexts. Everyday personal automations — checking if shoes are back in stock, monitoring apartment listings, tracking grocery prices, compiling a morning news briefing, logging expenses from email receipts — follow the identical structure. A [use case taxonomy](#appendix-use-case-taxonomy) identifies 14 distinct categories spanning monitoring, aggregation, planning, content creation, comparison, and more. Workflows aren't a technical niche. They're how people want to use agents in their daily lives.

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

## Appendix: Use Case Taxonomy

Workflow use cases organized by the fundamental job the workflow performs. Each category includes example workflows that follow the WorkflowSkill pattern: fetch data, process it, deliver a result.

### Watch & Alert — "Tell me when something changes"
Passive monitoring on a schedule. Exit quietly when nothing's happening, surface it when something matters.
- **Restock checker:** Monitor a product page for a specific shoe size; alert when available
- **Price drop alert:** Watch a product listing; alert when price falls below a threshold
- **Job posting monitor:** Scrape a company careers page daily for new positions matching keywords

### Collect & Digest — "Gather scattered info, give me the highlights"
Aggregate content from multiple sources into a single, filtered summary delivered on a schedule.
- **Morning news briefing:** Fetch headlines from several RSS feeds, deduplicate, summarize top stories
- **Email triage digest:** Search inbox for unread messages, score by importance, format a prioritized summary
- **Local events roundup:** Scrape a city events calendar, filter by category and date, deliver a weekly digest

### Track & Log — "Record this over time so I can see patterns"
Periodic capture of a value or state that accumulates into a history useful for review or trending.
- **Grocery price tracker:** Fetch prices for a shopping list weekly; log to a spreadsheet for comparison
- **Expenses from email:** Parse receipt emails daily; append line items to an expense log
- **Fitness log:** Pull yesterday's activity from a health API; append a daily summary row to a sheet

### Compare & Decide — "Help me pick between options"
Fetch structured data about multiple candidates, normalize it, and surface a comparison or recommendation.
- **Product comparison:** Scrape specs and prices for two or three models; format a side-by-side table
- **Restaurant picker:** Pull ratings and hours for nearby options; filter open ones and rank by score
- **Subscription audit:** List active recurring charges from bank emails; flag duplicates and unused services

### Plan & Prepare — "Help me get ready for something"
Combine multiple data sources into a structured plan or checklist tailored to an upcoming event.
- **Trip itinerary:** Fetch weather forecast, transit options, and attraction hours; compile a day-by-day plan
- **Meal plan from sales:** Scrape the weekly grocery circular; suggest a meal plan built around what's on sale
- **Party shopping list:** Take a guest list and menu; estimate quantities and generate a categorized shopping list

### Create & Draft — "Write this for me based on data I have"
Generate structured text (listings, messages, documents) by combining a template with live or stored data.
- **For-sale listing:** Take item details and photos; draft a Craigslist-style listing with title, description, and price
- **Thank-you notes:** Pull a list of gift-givers and gifts from a spreadsheet; draft a personalized note for each
- **Cover letter:** Fetch a job description; draft a tailored cover letter against a stored resume summary

### Discover & Recommend — "Find something good that fits my situation"
Query or search based on current context (what's in the fridge, what's on tonight) and return ranked options.
- **What to watch tonight:** Fetch new releases on streaming services; filter by genre preferences and runtime
- **Recipe from fridge:** Take a list of on-hand ingredients; retrieve and rank recipes that use them
- **Gift ideas:** Take a recipient's age, interests, and budget; search and return ranked gift suggestions

### Verify & Check — "Make sure this is safe / correct / okay"
Validate a document, product, or situation against known rules, databases, or requirements.
- **Allergen checker:** Fetch a restaurant's menu; flag dishes containing a specified allergen
- **Lease reviewer:** Parse a lease document; flag non-standard clauses against a checklist of tenant-friendly terms
- **Product recall checker:** Take a list of household appliances; check a recall database for each model number

### Maintain & Manage — "Keep this thing running without me thinking about it"
Ongoing housekeeping tasks that prevent problems or keep a system in a healthy state.
- **Bill payment monitor:** Fetch recent bank transactions; alert if a recurring bill hasn't cleared by its due date
- **Warranty tracker:** Pull purchase dates from email receipts; alert when a warranty is approaching expiration
- **Pantry restock:** Compare a pantry list to a minimum-stock threshold; generate a reorder list for low items

### Transform & Reformat — "Convert this from one form to another"
Take raw data in one format and restructure it into another without judgment or inference.
- **Receipt to expense report:** Parse receipt emails; convert line items into an expense report spreadsheet row
- **Contact extraction:** Parse an email thread; extract names, titles, and email addresses into a contact list
- **Booking confirmation parser:** Parse hotel and flight confirmation emails; output a unified trip summary

### Communicate & Respond — "Handle this routine communication for me"
Send, route, or organize messages based on incoming data and simple rules.
- **RSVP tracker:** Monitor email for responses to an invitation; tally yes/no/maybe counts in a spreadsheet
- **Follow-up reminder:** Check a CRM for contacts with no activity in 30 days; draft and queue follow-up emails
- **Review responder:** Fetch new product reviews below a rating threshold; draft polite response templates

### Learn & Research — "Compile what's known about this topic"
Gather, synthesize, and structure information from multiple sources into a useful reference document.
- **How-to compiler:** Search for tutorials on a task; extract key steps and consolidate into a single guide
- **Product deep-dive:** Fetch reviews, spec sheets, and forum discussions for a product; summarize pros and cons
- **DIY feasibility check:** Fetch material costs and tool requirements for a project; estimate total cost and complexity

### Seasonal & Life Event — "Help me get through this thing that only happens once a year"
Workflows triggered by calendar events or life milestones with bounded scope and a clear completion state.
- **Back-to-school supplies:** Fetch a school's supply list; compare against last year's purchases; output a delta list
- **Tax document collector:** Search email for W-2, 1099, and statement PDFs; list what's arrived and what's missing
- **Garage sale pricer:** Take a list of items to sell; look up comparable sold listings; suggest prices for each

### Small Business & Side Hustle — "Run this part of my business automatically"
Lightweight operational workflows for sole proprietors and small teams without dedicated ops staff.
- **Competitor pricing check:** Scrape prices for key SKUs from a competitor's site; compare to your own pricing
- **Inventory alert:** Check stock levels via an e-commerce API; alert when any item falls below reorder threshold
- **Client follow-up:** Fetch overdue invoices from a billing tool; draft a polite follow-up email for each
