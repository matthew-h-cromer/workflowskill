# WorkflowSkill

**Describe what you want. Claude writes the workflow. Temporal runs it forever.**

WorkflowSkill turns natural language descriptions into durable Python workflows backed by Temporal. Instead of an agent improvising every run, a workflow is authored once — readable Python code — and Temporal executes it with built-in retries, scheduling, and state persistence. Deterministic steps cost nothing; only steps that genuinely need judgment invoke a model.

That daily email triage costing $4.50/month in inference? With WorkflowSkill it's $0.09.

---

## Quickstart — Describe it, run it

### 1. Install

```sh
uv tool install .
```

### 2. Try the hello-world example

```sh
workflowskill run examples/hello-world.md
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

### 3. Create your own

WorkflowSkill includes `skill/SKILL.md` — a workflow authoring guide wired up as a Claude skill. Open Claude Code in this directory and describe what you want:

```
$ claude
> /workflow-author Create a workflow that takes a GitHub username as input,
  fetches their recent public activity, and returns a one-paragraph summary
  of what they've been working on.
```

Claude generates and saves the file to `examples/`. Run it:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
workflowskill run examples/github-activity-summary.md --input username=torvalds
```

```
Running github-activity-summary username='torvalds'
Temporal server: 127.0.0.1:55030
  ⟳ Executing api...
  ✓ api (291ms)
  ⟳ Executing llm...
  ✓ llm (3023ms)
╭────────────────────────────────── github-activity-summary ───────────────────────────────────╮
│ {                                                                                            │
│   "summary": "Torvalds has been exclusively active on the torvalds/linux repository, making  │
│ a high volume of push commits to the master branch throughout late February and early March  │
│ 2026. His activity consists entirely of direct commits, with multiple pushes per day on      │
│ several days, reflecting his ongoing role in maintaining and advancing the Linux kernel."    │
│ }                                                                                            │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

Workflows that use the `llm` action require `ANTHROPIC_API_KEY`.

---

## Example: What a workflow looks like

This is what Claude generates for the Hacker News task. You don't write this — Claude does.

```
examples/summarize-hacker-news.md
```

```markdown
---
name: summarize-hacker-news
description: Scrapes the Hacker News homepage and returns a concise summary of the top stories. Requires ANTHROPIC_API_KEY.
outputs:
  summary:
    type: str
---

# Summarize Hacker News

Scrapes story titles from https://news.ycombinator.com and uses Claude Haiku to
produce a concise, readable summary of the top stories.

```python
# Scrape story titles from the Hacker News front page
page = await workflow.execute_activity(
    "scrape",
    {
        "url": "https://news.ycombinator.com",
        "selectors": {"titles": ".titleline > a", "scores": ".score"},
    },
    retry_policy=RetryPolicy(maximum_attempts=3),   # ← retries built in
)

# Build a compact list of stories (deterministic Python — no LLM needed)
titles = page["results"].get("titles", [])
scores = page["results"].get("scores", [])
stories_parts = []
for i, title in enumerate(titles):
    if i < len(scores):
        stories_parts.append(f"- {title} ({scores[i]})")
    else:
        stories_parts.append(f"- {title}")
stories = "\n".join(stories_parts)

# Summarize with Claude Haiku
summary = await workflow.execute_activity(
    "llm",
    {
        "model": "claude-haiku-4-5-20251001",
        "system": "You are a concise tech news summarizer...",
        "prompt": f"Here are the top Hacker News stories:\n\n{stories}",
        "schema": {                                 # ← structured output
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": summary["summary"]}
```
```

What to notice: **frontmatter** declares inputs and outputs. The **Python code block** is the workflow logic. **Activities** are external calls — each one gets Temporal's retry and timeout semantics automatically.

---

## How it works

A SKILL.md file is a markdown file with YAML frontmatter and a Python code block. WorkflowSkill parses it, wraps the code as a Temporal workflow, and runs it using an embedded Temporal server.

```
┌─────────────────────────────────────────────────────────┐
│  workflowskill CLI                                      │
│                                                         │
│  loader/    — parse SKILL.md, extract workflow class    │
│  actions/   — wrap handlers as Temporal activities      │
│  runner/    — start embedded Temporal, run workflow     │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  Temporal (temporalio SDK)                              │
│  Durable execution, retries, scheduling, state          │
└─────────────────────────────────────────────────────────┘
```

Key capabilities available in generated workflows:

- **Retries** — `retry_policy=RetryPolicy(maximum_attempts=3)` on any activity
- **Parallel execution** — `asyncio.gather()` across multiple activities
- **Timeouts** — `start_to_close_timeout=timedelta(seconds=60)`
- **Structured LLM output** — pass a JSON schema to the `llm` action
- **Scheduling** — Temporal cron scheduling for recurring workflows

---

## Built-in actions

The CLI includes these actions out of the box:

| Action | Description |
|--------|-------------|
| `api` | Raw HTTP request with method, headers, and body — use for JSON APIs |
| `scrape` | Extract structured data from web pages via CSS selectors |
| `llm` | Call Claude with optional structured output schema |

---

## Why WorkflowSkill?

### Cost

When an LLM orchestrates a workflow, it reasons through every step on every run. For a daily email triage of 20 emails:

| | Traditional agent | WorkflowSkill |
|---|---|---|
| LLM steps per run | 6 | 1 |
| Tokens per run | ~8,100 | ~6,000 |
| Model | Sonnet ($15/M output) | Haiku ($1.25/M output) |
| Cost per run | ~$0.15 | ~$0.003 |
| Monthly (30 runs) | ~$4.50 | ~$0.09 |

Purely deterministic workflows — backups, aggregation, rule-based handling — use no LLM at all.

### Reliability

LLM orchestration improvises. It reads instructions and decides, in that moment, at that temperature, which tools to call and in what order. Most of the time it's right. But "most of the time" is not a property you want in a system running unattended on a schedule.

WorkflowSkill workflows are Python code. The execution path is explicit and auditable. Temporal handles failures: retries with configurable backoff, step-level execution history, and durable state across restarts. Every run follows the same plan. When something goes wrong, you know exactly which step failed and why.

---

## Development

```sh
uv sync --extra dev   # Install all dependencies including dev tools
uv run pytest cli/tests           # Run CLI tests
uv run mypy cli/workflowskill/   # Type checking
uv run ruff check cli/workflowskill/  # Linting
uv run ruff format cli/workflowskill/ # Formatting

# Run without installing:
uv run python -m workflowskill.main run examples/hello-world.md
```

---

## Requirements

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/) recommended

---

## Further reading

- [docs/SPEC.md](docs/SPEC.md) — SKILL.md format specification
- [skill/SKILL.md](skill/SKILL.md) — Workflow authoring guide (what Claude uses to generate workflows)
- [docs/PROPOSAL.md](docs/PROPOSAL.md) — Design rationale and architecture
- [examples/](examples/) — Runnable example workflows
