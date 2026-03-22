# WorkflowSkill

[![npm](https://img.shields.io/npm/v/workflowskill)](https://www.npmjs.com/package/workflowskill)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/tests-80%20passing-brightgreen)](https://github.com/matthew-h-cromer/workflowskill)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Describe what you want. Claude writes the workflow. Temporal runs it forever.**

WorkflowSkill turns natural language descriptions into durable Python workflows backed by Temporal. Instead of an agent improvising every run, a workflow is authored once — readable Python code — and Temporal executes it with built-in retries, scheduling, and state persistence. Deterministic steps cost nothing; only steps that genuinely need judgment invoke a model.

That daily email triage costing $4.50/month in inference? With WorkflowSkill it's $0.09.

---

## Quickstart

### 1. Install

```sh
uv tool install .
```

### 2. Run the hello-world example

```sh
workflowskill run examples/builtin/hello-world.md
```

```
Running hello-world
Temporal server: 127.0.0.1:54215
╭──────── hello-world ─────────╮
│ {                            │
│   "message": "Hello, world!" │
│ }                            │
╰──────────────────────────────╯
```

No API key needed. This proves the engine works.

### 3. Author your first workflow

Open Claude Code in this directory and describe what you want:

```
$ claude
> /workflow-author Create a workflow that takes a GitHub username as input,
  fetches their recent public activity, and returns a one-paragraph summary
  of what they've been working on.
```

Claude generates and saves the file to `workflows/`. Run it:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
workflowskill run workflows/github-activity-summary.md -i username=torvalds
```

```
Running github-activity-summary username='torvalds'
  ✓ api (291ms)
  ✓ llm (3023ms)
╭─────────────────────────────────╮
│ {                               │
│   "summary": "Torvalds has..."  │
│ }                               │
╰─────────────────────────────────╯
```

---

## Core Examples

| File | What it does |
|------|-------------|
| `examples/builtin/hello-world.md` | Minimal workflow, no activities |
| `examples/builtin/llm-haiku.md` | Single `llm` call, generates a haiku |
| `examples/builtin/summarize-hacker-news.md` | `scrape` → Python → `llm` pipeline |
| `examples/builtin/snoqualmie-snow-report.md` | Parallel `scrape` + `api` → `llm` |

---

## What a workflow looks like

You don't write this — Claude does. Each workflow is a markdown file with YAML frontmatter and a Python code block:

```yaml
---
type: workflow
name: summarize-hacker-news
description: Scrapes the Hacker News homepage and returns a concise summary.
outputs:
  summary:
    type: str
---
```

```python
# examples/builtin/summarize-hacker-news.md  (the ## Workflow code block)

# Scrape story titles
page = await workflow.execute_activity(
    "scrape",
    {"url": "https://news.ycombinator.com", "selectors": {"titles": ".titleline > a"}},
    retry_policy=RetryPolicy(maximum_attempts=3),
)

titles = page["results"].get("titles", [])
stories = "\n".join(f"- {t}" for t in titles)

# Summarize with Claude Haiku
result = await workflow.execute_activity(
    "llm",
    {
        "model": "claude-haiku-4-5-20251001",
        "prompt": f"Summarize these Hacker News stories:\n\n{stories}",
        "schema": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]},
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": result["summary"]}
```

**Frontmatter** declares inputs and outputs. The **Python code block** is the logic. **Activities** are external calls — each gets Temporal's retry and timeout semantics automatically.

---

## How it works

```
workflowskill run examples/builtin/my-workflow.md
         │
         ▼
  loader/ — parse SKILL.md, build workflow class
  actions/ — wrap handlers as @activity.defn
  runner/ — start embedded Temporal, execute workflow
         │
         ▼
  Temporal (temporalio SDK)
  Durable execution · retries · scheduling · state
```

Built-in workflow capabilities:

- **Retries** — `retry_policy=RetryPolicy(maximum_attempts=3)` on any activity
- **Parallel execution** — `asyncio.gather()` across multiple activities
- **Timeouts** — `start_to_close_timeout=timedelta(seconds=60)`
- **Structured LLM output** — pass a JSON schema; get back typed fields
- **Determinism** — pure Python logic is free; `llm` calls only when needed

---

## Built-in actions

```sh
workflowskill run my-workflow.md          # uses builtin actions by default
```

| Action | Description |
|--------|-------------|
| `api` | Raw HTTP request — use for JSON APIs |
| `scrape` | Extract structured data via CSS selectors |
| `llm` | Call Claude with optional JSON schema |

---

## Ecosystem Tool Packs

Tool packs let you author and test workflows that target a specific platform's native tools. When you run locally with `--toolpack`, the CLI uses Python implementations that match the platform's interfaces exactly — so you can develop and iterate without deploying.

```sh
workflowskill run my-workflow.md --toolpack openclaw
```

### OpenClaw

[OpenClaw](https://docs.openclaw.ai) is an AI agent platform with a rich set of native tools. WorkflowSkill lets you author OpenClaw workflows locally using Claude Code, test them with the CLI, and deploy them directly to your OpenClaw instance.

**Available actions:**

| Action | Description |
|--------|-------------|
| `exec` | Run shell commands |
| `browser` | Headless Chromium — navigate, snapshot, click, type |
| `web_search` | Search the web (requires `BRAVE_API_KEY`) |
| `web_fetch` | Fetch and extract page content as markdown or text |
| `llm_task` | Structured LLM call with JSON output |
| `read` | Read a file |
| `write` | Write a file |
| `edit` | Replace text in a file |

**Author an OpenClaw workflow:**

```
$ claude
> /workflow-author-openclaw Search the web for recent AI agent news,
  fetch the top 3 articles, and return a summary.
```

Claude injects OpenClaw tool definitions into context and generates the workflow.

**Test it locally:**

```sh
# First-time setup
uv sync --extra dev --extra openclaw
uv run playwright install chromium  # only if using browser action

# Run with OpenClaw tools
export ANTHROPIC_API_KEY=sk-ant-...
export BRAVE_API_KEY=...  # only if using web_search
workflowskill run examples/openclaw/search-and-summarize.md --toolpack openclaw
```

**Example OpenClaw workflows:**

| File | What it does |
|------|-------------|
| `examples/openclaw/search-and-summarize.md` | Search → fetch → summarize |
| `examples/openclaw/run-and-report.md` | Run a shell command, summarize output |
| `examples/openclaw/webpage-monitor.md` | Fetch a page (browser or web_fetch) + extract info |

**Deploy to OpenClaw:**

Once the workflow runs locally, copy the generated SKILL.md file to your OpenClaw workspace's `skills/` directory. OpenClaw picks it up automatically on the next session.

---

## Development

```sh
uv sync --extra dev              # Install dev dependencies
uv run pytest cli/tests          # Run CLI tests (80 tests)
uv run mypy cli/workflowskill/   # Type checking
uv run ruff check cli/workflowskill/   # Linting
uv run ruff format cli/workflowskill/ # Formatting

# Run without installing:
uv run python -m workflowskill.main run examples/builtin/hello-world.md
```

### Eval suite

The eval suite measures how well `skill/SKILL.md` teaches Claude to generate correct workflows. Evals call the Anthropic API and cost money — run them on demand.

```sh
uv run pytest -m eval -v                     # Run all evals
uv run pytest -m eval -k test_loop -v        # Run one eval
EVAL_RETRIES=5 uv run pytest -m eval -v      # Multi-trial stability check
uv run pytest -m eval --eval-snapshot -v     # Save outputs for diffing
```

Requires `ANTHROPIC_API_KEY`. Run evals **before and after** editing `skill/SKILL.md` to confirm your changes improved generation quality.

---

## Requirements

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/) recommended

---

## Further reading

- [`skill/SKILL.md`](skill/SKILL.md) — Workflow authoring guide
- [`examples/`](examples/) — Runnable example workflows
