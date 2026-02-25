# WorkflowSkill × OpenClaw Integration

This guide explains how to load WorkflowSkill as an OpenClaw plugin. Once installed, OpenClaw's agent can author, validate, run, and review WorkflowSkill YAML workflows — directly, without a separate dashboard.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ OpenClaw Agent                                       │
│                                                      │
│  /workflowskill-author  ←  SKILL.md (authoring guide│
│                             + lifecycle + tools)     │
│                                                      │
│  workflowskill_validate ─┐                           │
│  workflowskill_run       │  Plugin tools             │
│  workflowskill_runs     ─┘  (openclaw/tools/)        │
└─────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
  WorkflowSkill runtime       workspace/
  (src/runtime/index.ts)        skills/
                                 workflow-runs/
```

### Design Constraints

1. **Workflows execute without an agent.** Cron-triggered workflows call the runtime directly.

2. **Conversational generation is native.** The `/workflowskill-author` skill embeds the full authoring guide so the agent writes YAML directly. No `workflowskill_generate` tool needed.

3. **Run review via agent.** The agent uses `workflowskill_runs` to list past runs, inspect individual RunLogs, and explain failures. No separate dashboard.

## Setup

### 1. Install OpenClaw

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### 2. Build the WorkflowSkill runtime

```bash
cd /path/to/rfc-workflowskill
npm install
npm run build
```

### 3. Link the plugin

```bash
openclaw plugins install --link "$(pwd)/openclaw"
```

### 4. Set environment variables

Create or update `~/.openclaw/.env` (or set system env vars):

```bash
# Required for LLM steps in workflows and for conversational authoring
ANTHROPIC_API_KEY=sk-ant-...

# Optional: enables Gmail and Sheets built-in tools
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

See the [Google OAuth2 setup guide](docs/google-oauth2-setup.md) for credential instructions.

### 5. Restart the gateway

```bash
openclaw gateway restart
```

> **Token mismatch warning:** If you see `⚠️ Config token differs from service token`, run the following before restarting:
> ```bash
> openclaw gateway install --force
> openclaw gateway restart
> ```
> This syncs the daemon's installed token with your current config.

### 6. Verify

```bash
openclaw plugins list
# → workflowskill-plugin: 3 tools registered

openclaw skills list
# → workflowskill-author (user-invocable)
```

## Tool Reference

### `workflowskill_validate`

Parse and validate a SKILL.md or raw YAML workflow. Use before running to catch errors early.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | SKILL.md text or raw workflow YAML |

**Returns:**
```json
{
  "valid": true,
  "errors": [],
  "name": "daily-triage",
  "stepCount": 4,
  "stepTypes": ["tool", "transform", "llm", "exit"]
}
```

### `workflowskill_run`

Execute a workflow directly and return the full RunLog. Persists the log to `workflow-runs/`.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `workflow_name` | string | no* | Name of a skill resolved from skills directories |
| `content` | string | no* | Inline SKILL.md content (bypasses skill files) |
| `inputs` | object | no | Override workflow input defaults |

*One of `workflow_name` or `content` is required.

**Returns:** Full `RunLog` JSON — id, status, summary, steps[], outputs, error (if failed).

### `workflowskill_runs`

List and inspect past run logs. Use for run review, failure diagnosis, and trend analysis.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| *(none)* | | | List the 20 most recent runs (summary view) |
| `workflow_name` | string | no | Filter by workflow name |
| `run_id` | string | no | Get full RunLog detail for one run |
| `status` | string | no | Filter by `"success"` or `"failed"` |

**Summary view** (no `run_id`):
```json
[
  {
    "id": "run-2024-01-15T09-00-00",
    "workflow": "daily-triage",
    "status": "success",
    "started_at": "2024-01-15T09:00:00.000Z",
    "duration_ms": 3421,
    "steps_executed": 4,
    "steps_skipped": 0,
    "total_tokens": 820
  }
]
```

**Detail view** (with `run_id`): Full `RunLog` with per-step records.

## Workflow Lifecycle

```
describe workflow (natural language)
    ↓
/workflowskill-author  (agent writes YAML)
    ↓
workflowskill_validate  (catch errors before running)
    ↓
workflowskill_run  (test run, review RunLog)
    ↓
workflowskill_runs  (diagnose failures, iterate)
    ↓
cron  (schedule for automated execution)
```

## Run Review Examples

The agent can handle natural language run questions:

**"Show me my recent workflow runs"**
→ `workflowskill_runs` (list) → formatted summary table

**"Why did daily-triage fail?"**
→ `workflowskill_runs(workflow_name: "daily-triage", status: "failed")` → find latest failed run
→ `workflowskill_runs(run_id: "...")` → detail view
→ Agent explains first failed step's error + inputs

**"Compare the last two fetch-news runs"**
→ List filtered by name → two detail calls → diff outputs/timing

**"How many tokens did daily-triage use this week?"**
→ List filtered by name → sum `total_tokens` across runs

## Cron Scheduling

Workflows run directly via the CLI — no agent session required.

### System cron

```bash
crontab -e
```

```cron
# Run daily-triage every weekday at 9 AM
0 9 * * 1-5 /usr/local/bin/workflowskill run /path/to/skills/daily-triage/SKILL.md \
  >> /tmp/daily-triage.log 2>&1
```

Run logs are written to `workflow-runs/` automatically. Review them later via `workflowskill_runs`.

### OpenClaw cron hook (if supported)

```json
{
  "cron": "0 9 * * 1-5",
  "command": "workflowskill run skills/daily-triage/SKILL.md"
}
```

## Workspace Layout

```
<workspace>/
  skills/              # Workflow SKILL.md files (one per subdirectory)
    daily-triage/
      SKILL.md
    fetch-news/
      SKILL.md
  workflow-runs/       # RunLog JSON files (auto-created)
    daily-triage-2024-01-15T09-00-00.000Z.json
    fetch-news-2024-01-15T08-30-00.000Z.json
```

## Development Notes

The plugin imports directly from `../src/` via relative paths. The TypeScript source runs under `tsx` (or after `npm run build`, from `../dist/`).

When iterating on the plugin:
1. Edit files in `openclaw/`
2. `openclaw gateway restart` to reload
3. Test via agent or `openclaw tools invoke workflowskill_validate '{"content": "..."}'`
