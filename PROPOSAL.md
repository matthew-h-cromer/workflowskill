# Proposal: WorkflowSkill — Temporal-Based Workflow Engine for Agent Automation

> **Related documents:** [Specification](SPEC.md) | [Examples](examples/)

## Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
  - [The Cost Problem](#the-cost-problem)
  - [The Reliability Problem](#the-reliability-problem)
- [Why Temporal](#why-temporal)
- [Why Python](#why-python)
- [Authoring Model](#authoring-model)
- [Architecture](#architecture)
- [Security Considerations](#security-considerations)
- [Vision: Closing the Author/Consumer Gap](#vision-closing-the-authorconsumer-gap)
- [Appendix: Use Case Taxonomy](#appendix-use-case-taxonomy)

## Executive Summary

AI agents can now do real work on your behalf: triage your email, brief you on your calendar, monitor your finances, publish content on a schedule. But there's a problem. Every time one of these automations runs, the agent approaches it like it's never done it before. It reads its instructions from scratch, reasons about what to do, picks its tools, and improvises its way through — even if it ran the exact same job yesterday and will run it again tomorrow.

This makes recurring automations expensive and fragile. A simple daily email triage can cost $4.50/month in AI inference alone. More importantly, results drift between runs. Output that looked fine on Monday gets formatted differently on Tuesday. A step that worked last week gets skipped this week. Users learn not to trust their automations, and many abandon them entirely.

**WorkflowSkill** fixes this with a different approach: agents author Python workflows using Temporal, the industry-standard durable execution engine. Instead of improvising each run, an agent writes a workflow once — readable Python code in a SKILL.md file — and Temporal executes it with built-in durability, retry logic, and scheduling. Deterministic steps cost nothing; only steps that genuinely need judgment invoke a model.

The result: that $4.50/month email triage drops to $0.09. Every run follows the same plan. Behavior is auditable and version-controlled. The automation becomes reliable enough to run while you sleep.

## Problem Statement

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

In this example, only step 4 is doing work that truly requires an LLM. With WorkflowSkill:

| | Current | WorkflowSkill | Reduction |
|---|---------|---------|-----------|
| LLM steps | 6 | 1 | 83% fewer |
| Tokens per run | ~8,100 | ~6,000 | 26% fewer |
| Model | Sonnet ($15/M output) | Haiku ($1.25/M output) | 12x cheaper per token |
| Cost per run | ~$0.15 | ~$0.003 | 98% cheaper |
| Monthly (30x) | ~$4.50 | ~$0.09 | $4.41 saved per month |

Purely deterministic workflows (backups, aggregation, rule-based handling) use no LLM at all.

### The Reliability Problem

When an LLM orchestrates a workflow, it improvises. It reads the SKILL.md and decides, in that moment, with that context window, at that temperature, which tools to call, in what order, with what arguments. Most of the time it gets it right. But *most of the time* is not a property you want in a system running unattended on a schedule.

Some failure modes: The LLM might format output differently on Tuesday than Monday, breaking a downstream parser. It might decide to skip a step that seems redundant but isn't. It might handle a failed tool call by apologizing in the notification rather than retrying. None of these are bugs in the LLM. They are the natural consequence of using a probabilistic system to orchestrate a deterministic job.

WorkflowSkill addresses this at the architectural level. The execution path is Python code, not prose. Error handling is explicit: Temporal retries failed activities with configurable backoff. Every run follows the same plan. That plan can be read, audited, version-controlled, and tested before it touches production systems. When something goes wrong, Temporal's execution history gives you step-level timing and failure reasons.

## Why Temporal

Temporal is the right foundation for three reasons:

**Training data.** Temporal has extensive public documentation, tutorials, example repositories, and Stack Overflow answers. LLMs have seen a lot of Temporal code. When an agent authors a workflow, it can draw on this existing knowledge to write correct, idiomatic Temporal code — far more reliably than it could with a custom DSL no model has seen before.

**Reference implementations.** Any agent authoring a Temporal workflow can look at real Temporal Python examples in its training data. The patterns are established: `@workflow.defn`, `@activity.defn`, `workflow.execute_activity()`. These idioms are correct by construction.

**Built-in durability.** Temporal provides retry policies, activity heartbeating, timeouts, scheduled workflows (cron), and state persistence — all built in, all well-tested. We don't need to implement any of this ourselves. An agent can author a production-grade durable workflow by following standard Temporal patterns.

The result is a framework where agents author workflows that are durable, schedulable, retryable, and observable from day one — not because we built those features, but because we chose a foundation that already has them.

## Why Python

Python is the right language for agent-authored workflows:

- **Most LLM training data.** More Python code exists in LLM training sets than any other language. Agents write Python more reliably and naturally than any alternative.
- **Most accessible for humans.** Technical and semi-technical users can read and understand Python. Workflows authored by agents remain auditable.
- **Temporal SDK quality.** The Temporal Python SDK is mature and well-documented.
- **Ecosystem.** `httpx`, `anthropic`, `beautifulsoup4` — the libraries needed for common workflow actions are idiomatic Python with excellent documentation.

## Authoring Model

Workflows are embedded as Python code blocks in SKILL.md files. The format is:

```
---
name: my-workflow
description: What this workflow does
inputs:
  query:
    type: str
    default: "default value"
---

# My Workflow

A description of what this workflow does.

\```python
result = await workflow.execute_activity(
    "my_action",
    {"query": query},
)
return {"result": result}
\```
```

This format has several advantages:

1. **Readable.** The markdown prose explains the intent; the Python code shows the implementation.
2. **Auditable.** Every action call, every data flow, every conditional is visible as Python code.
3. **Agent-friendly.** Agents author Python naturally. The SKILL.md format adds minimal overhead — just frontmatter for metadata and a fenced code block.
4. **Version-controlled.** The workflow is a text file. It diffs cleanly, commits naturally, and can be reviewed like any other code.

## Architecture

WorkflowSkill is a **Python library** (`workflowskill`). It is tool-agnostic — it knows nothing about specific tools like `api` or `llm`. Consumers (the CLI, OpenClaw plugin, future platforms) import the library and register their own tools as Temporal activities via the **actions** abstraction.

```
┌─────────────────────────────────────────────────────────┐
│  Consumer (CLI / OpenClaw plugin / custom runner)       │
│                                                         │
│  from workflowskill import ActionRegistry, run_skill          │
│  registry = ActionRegistry()                            │
│  registry.register("api", handler, ...)                 │
│  result = await run_skill("my-skill.md", inputs, registry) │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  workflowskill library                                        │
│                                                         │
│  loader/    — parse SKILL.md, extract workflow class    │
│  actions/   — ActionRegistry: wrap handlers as          │
│               Temporal activities                       │
│  runner/    — start embedded Temporal, run workflow     │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  Temporal (temporalio SDK)                              │
│  Durable execution, retries, scheduling, state          │
└─────────────────────────────────────────────────────────┘
```

**Library/consumer separation:** The `workflowskill` library provides the action registration interface and the runner. The CLI registers its built-in tools (`api`, `web_scrape`, `llm`, etc.) as actions. An OpenClaw plugin would import `workflowskill` and register OpenClaw's tools instead. The library has no opinion about what tools exist.

## Security Considerations

Python code is the security boundary, and that's an advantage over natural language instructions.

**Workflows are auditable.** Every action call, every data flow, and every conditional is Python code that can be reviewed before the workflow runs. There is no hidden logic. A security review of a WorkflowSkill workflow is a review of readable code, not an interpretation of what an LLM might decide to do.

**The runtime has no capabilities of its own.** WorkflowSkill can only execute actions that the consumer has explicitly registered. If a consumer registers `api` but not `shell_exec`, the workflow cannot execute shell commands — even if the Python code tries to import `subprocess`. Actions are the only execution boundary, and consumers control which actions exist.

**Python code is more auditable than prose.** A malicious SKILL.md instruction written in natural language can be subtle and hard to detect. Malicious Python code making unexpected network calls is visible as code. Static analysis tools, code review, and sandboxing all apply directly to Python in ways they cannot apply to prose.

The remaining risk is malicious workflow definitions. This is the same class of risk that exists today with malicious SKILL.md instructions. The mitigation is the same: skill vetting and platform-level action authorization. WorkflowSkill makes this review easier because the data flow is explicit code rather than inferred intent.

## Vision: Closing the Author/Consumer Gap

Today, there is a practical gap between workflow authors (technical users who write the Python code) and workflow consumers (non-technical users who run workflows authored by others). This gap exists because authoring Python Temporal workflows requires technical knowledge.

We are actively working to close that gap. The end goal is: a non-technical user describes what they want in plain language, and an agent generates a production-grade Temporal workflow that runs reliably on a schedule. The author/consumer split dissolves.

Temporal makes this vision achievable. Because agents have extensive training data on Temporal Python patterns, they can generate correct, idiomatic workflows from natural language descriptions with increasing reliability. Every improvement in agent capability directly improves the quality of generated workflows. The framework meets the agent where it already is.

## Appendix: Use Case Taxonomy

Workflow use cases organized by the fundamental job the workflow performs. Each category includes example workflows that follow the WorkflowSkill pattern: register actions, fetch data, process it, deliver a result.

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

Query or search based on current context and return ranked options.

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

### Small Business & Side Hustle — "Run this part of my business automatically"

Lightweight operational workflows for sole proprietors and small teams without dedicated ops staff.

- **Competitor pricing check:** Scrape prices for key SKUs from a competitor's site; compare to your own pricing
- **Inventory alert:** Check stock levels via an e-commerce API; alert when any item falls below reorder threshold
- **Client follow-up:** Fetch overdue invoices from a billing tool; draft a polite follow-up email for each
