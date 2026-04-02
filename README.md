# WorkflowSkill

[![npm](https://img.shields.io/npm/v/workflowskill)](https://www.npmjs.com/package/workflowskill)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Agents improvise. Workflows deliver.**

An open standard for turning agent skills into durable, deterministic workflows that run on any platform.

```
$ claude
> /workflow-author Write me a workflow that fetches my last 10 Gmail messages,
  summarizes them, and posts the summary to #daily-digest in Slack.
```

```
$ workflowskill run workflows/gmail-to-slack.md --toolkit weldable

Running gmail-to-slack
  toolkit: weldable (https://weldable.ai)
  ⟳ gmail.search_messages
  ✓ gmail.search_messages (441ms)
  ⟳ anthropic.llm
  ✓ anthropic.llm (2890ms)
  ⟳ slack.post_message
  ✓ slack.post_message (198ms)
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

Because the logic is code — not a prompt being re-interpreted — the runtime can offer capabilities that agents can't: durable execution that survives failures, automatic retries, timeouts, pausing and resuming, human-in-the-loop approvals, deterministic outcomes, and scheduling on a timer or triggering from external events.

Workflow Skills are portable across any platform that implements the WorkflowSkill standard, and they're built on the open [Agent Skills](https://agentskills.io/) spec. A workflow authored for one platform runs on any other that supports the same actions — no rewriting, no lock-in. The goal is to do for durable execution what Agent Skills did for skills — an open ecosystem of workflows where the whole community moves forward together.

To support WorkflowSkill, a platform implements two things: a [**toolkit**](#toolkits) (which handles action execution — routing `execute_activity()` calls to the platform's integrations) and a [**runtime**](#runtimes) (which handles orchestration — durability, checkpointing, retries, and pause/resume). These are independent extension points: any toolkit works with any runtime.

---

## Quickstart

**Prerequisites:** [uv](https://docs.astral.sh/uv/getting-started/installation/) · [Claude Code](https://claude.ai/code)

### 1. Install

```sh
git clone https://github.com/matthew-h-cromer/workflowskill.git
cd workflowskill
uv tool install .
```

### 2. Run the hello-world example

No toolkit needed — this workflow is pure Python:

```sh
workflowskill run examples/hello-world.md
```

```
╭──────── hello-world ────────╮
│ {                           │
│   "message": "Hello, World!"│
│ }                           │
╰─────────────────────────────╯
```

### 3. Author your own

Open Claude Code in this directory and use the `/workflow-author` skill:

```
> /workflow-author Write me a workflow that takes a name as input and returns a greeting.
```

This works because the workflow is pure Python — no external tools needed. For workflows that call real services, you'll need to specify a toolkit so the authoring agent knows what actions are available. See [Connect a toolkit](#connect-a-toolkit) below.

Claude generates the file and saves it to `workflows/`. Run it:

```sh
workflowskill run workflows/greeting.md -i name=Linus
```

```
╭───────── greeting ──────────╮
│ {                           │
│   "message": "Hello, Linus!"│
│ }                           │
╰─────────────────────────────╯
```

### 4. Connect a toolkit

Workflows become powerful when they can call external services. **Toolkits** connect workflows to real integrations — each toolkit brings its own actions, authentication, and infrastructure.

This example uses [Weldable](https://weldable.ai), which provides hundreds of integrations across Slack, Gmail, Google Sheets, GitHub, and more. Sign up at [weldable.ai](https://weldable.ai), then run:

```sh
workflowskill login --toolkit weldable
```

This opens your browser to authorize your Weldable account. Your API key is saved to `.env` automatically.

Now you can author workflows that use real services:

```
$ claude
> /workflow-author Write me a workflow that fetches my last 10 Gmail messages,
  summarizes them, and posts the summary to #daily-digest in Slack.
```

```sh
workflowskill run workflows/gmail-to-slack.md --toolkit weldable
```

```
Running gmail-to-slack
  toolkit: weldable (https://weldable.ai)
  ⟳ gmail.search_messages
  ✓ gmail.search_messages (441ms)
  ⟳ anthropic.llm
  ✓ anthropic.llm (2890ms)
  ⟳ slack.post_message
  ✓ slack.post_message (198ms)
╭──────── gmail-to-slack ─────────╮
│ { "message_ts": "172..." }      │
╰─────────────────────────────────╯
```

With Weldable, authentication is handled for you — connect services once at weldable.ai and workflows use them automatically. See the [full action catalog](cli/workflowskill/toolkits/weldable/prompt.md) for every available action and its parameters.

---

## Toolkits

A toolkit handles **action execution** — it routes each `workflow.execute_activity()` call to the right API, SDK, or service. Toolkit authors implement a single method: `execute(action, args) -> dict`. The workflow code is unchanged regardless of which toolkit runs it.

| Toolkit | Platform | Actions |
|---------|----------|---------|
| `weldable` | [Weldable](https://weldable.ai) | 264+ authenticated integrations (Slack, Gmail, GitHub, and more) |

Run a workflow with a toolkit:

```sh
workflowskill run workflow.md --toolkit weldable
```

[→ Implement a toolkit](CONTRIBUTING.md#toolkits)

---

## Runtimes

A runtime handles **workflow orchestration** — durability, checkpointing, retries, pause/resume, and signals. The same workflow code runs on any runtime; only the execution guarantees differ.

| Runtime | Description |
|---------|-------------|
| `dbos` *(default)* | Durable execution via [DBOS](https://dbos.dev). Each action is checkpointed to SQLite; crash recovery resumes from the last completed step. |

Override the runtime:

```sh
workflowskill run workflow.md --toolkit weldable --runtime dbos
```

[→ Implement a runtime](CONTRIBUTING.md#runtimes)
