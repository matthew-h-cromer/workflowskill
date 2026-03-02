# WorkflowSkill Reference Implementation

## Project Overview

A standalone TypeScript runtime that parses, validates, and executes WorkflowSkill YAML definitions. A user describes a workflow in natural language, Claude Code generates WorkflowSkill YAML (via `.claude/skills/workflow-author/`), and the runtime executes it.

**Repo layout:**
- `SPEC.md` — language specification (source of truth for all behavior)
- `PROPOSAL.md` — justification and alternatives
- `examples/` — runnable workflow examples (at repo root, referenced from SPEC.md and PROPOSAL.md)
- `runtime/` — reference TypeScript implementation (all source, tests, and tooling live here)
- `.claude/skills/workflow-author/SKILL.md` — teaches Claude Code to author valid WorkflowSkill YAML

## Verify Every Change

**Run from `runtime/` after every change:** `npm run typecheck && npm run test && npm run lint`

- **The spec is the source of truth.** Read `SPEC.md` before modifying any module. If the spec and the implementation disagree, the spec wins.
- **Mock external dependencies.** No API calls in unit or integration tests. Use the adapter interfaces.
- **Keep CLAUDE.md current.** After completing any iteration, update this file to reflect what changed.
- **If the spec is ambiguous, make a reasonable choice and document it in a code comment.**

## Do Not Edit

- **`runtime/package-lock.json`** — managed by npm.

## Engineering Principles

- **No silent fallbacks.** Throw clear errors. Never silently degrade.
- **Fix root causes, not symptoms.** Fix the prompt, not the extraction logic.
- **Improve the skill, not the parser.** When LLM output causes runtime failures, fix the workflow-author skill (`/workflow-author`) to generate better prompts — don't add parsing heuristics to the executor. Other spec implementations won't share custom parsing logic.

## Architecture

````
runtime/src/
├── types/          # TypeScript interfaces mirroring every spec field and constraint
├── parser/         # SKILL.md → typed WorkflowDefinition (extract markdown → parse YAML → Zod validate)
│   ├── extract.ts  # Fenced ```workflow block extraction from markdown
│   └── schema.ts   # Zod schemas (runtime validation layer)
├── expression/     # $-reference expression language (lexer → parser → evaluator)
│   ├── lexer.ts    # Tokenizer for expressions
│   ├── parser.ts   # Recursive-descent parser → AST
│   └── evaluator.ts# AST evaluation against runtime context
├── validator/      # Pre-execution validation (DAG cycles, type checks, tool availability)
├── executor/       # Five step executors, one per type
│   ├── transform.ts# filter, map, sort (pure data manipulation)
│   ├── conditional.ts # Branch evaluation → { branch, stepIds }
│   ├── exit.ts     # Early termination with status + output
│   ├── tool.ts     # Tool invocation via ToolAdapter
│   ├── llm.ts      # LLM call with prompt interpolation via LLMAdapter
│   └── types.ts    # StepExecutionError, StepOutput, DispatchResult
├── runtime/        # Orchestrator: validate → init context → 9-step lifecycle → run log
├── config/         # loadConfig() — env vars with .env fallback
├── dev-tools/      # Dev tool adapter + tool implementations (for local workflow authoring)
│   ├── dev-tool-adapter.ts     # DevToolAdapter — registers all dev tools
│   └── tools/                   # Dev tool implementations
│       ├── http-request.ts      # http.request (Node fetch)
│       ├── html-select.ts       # html.select (cheerio)
│       ├── gmail.ts             # gmail.search, gmail.read, gmail.send
│       └── sheets.ts            # sheets.read, sheets.write, sheets.append
├── adapters/       # Mock adapters + LLM adapter
│   ├── mock-tool-adapter.ts    # Mock for testing
│   ├── mock-llm-adapter.ts     # Mock for testing
│   └── anthropic-llm-adapter.ts # Real Anthropic SDK adapter
├── cli/            # Two commands: validate, run
└── index.ts        # Single entry point re-exporting all public APIs

runtime/test/fixtures/           # 12 targeted + 3 graduation + 4 malformed workflow fixtures
runtime/test/unit/               # Unit tests (parser, expression, types, validator, executor)
runtime/test/integration/        # Integration tests (runtime, graduation)
runtime/test/workflow-authoring/ # Skill evaluation suite (cases, harness, scorecard, fixtures)

examples/                        # Real-world workflow examples (repo root)
examples/hello-world.md          # Zero-config example — returns "Hello, world!" (no API keys needed)
examples/fetch-job-postings.md   # LinkedIn scraper example
examples/hello-world-gmail.md    # Gmail send example (requires Google OAuth2)

.claude/skills/workflow-author/  # Claude Code skill for authoring WorkflowSkill YAML
````

**Dependency flow:** types → parser + expression → validator + executor → runtime → cli

## Key Design Decisions

- **LLM executor does NOT wrap output** in the first output key. Output is stored directly (like tool steps). This ensures `$steps.<id>.output.field` works consistently across step types.
- **Transform executor DOES wrap output** in the first declared output key (e.g., `{ filtered: [...] }`), since transforms produce arrays that need naming.
- **ExitStep.output** supports both `string` (expression) and `Record<string, unknown>` (object literal with resolvable values). The spec examples use both forms.
- **Branch steps** (those referenced in conditional then/else) are collected upfront and skipped during sequential execution, only run when selected by a conditional.
- **`each` iteration** is handled by the runtime, not the executor. The runtime calls the executor once per item with `$item`/`$index` in context.
- **`${}` template interpolation** replaces the removed `+` operator for string building. String `value` fields containing `${ref}` are interpolated: `"${inputs.base_url}${item}.json"`. References inside `${...}` omit the `$` prefix. Whole-value `${ref}` preserves type. Escape with `$${` for literal `${`. Primary use case: constructing dynamic URLs in `each` + tool patterns.
- **Unified `value` field** on step inputs, step outputs, and workflow outputs. Strings starting with `$` are auto-detected as expressions; strings containing `${...}` are templates; all others are literals. Escape literal `$` with `$$` (e.g., `value: "$$100"` → `"$100"`). Parser normalizes legacy `source`/`default` to `value` via Zod transforms for backwards compatibility. **Workflow inputs use `default`** instead of `value` — it's an overridable fallback, not a fixed value. Parser normalizes legacy `value` → `default` on workflow inputs for backwards compat.
- **Step output `value`** uses `$result` to map from the raw executor result. Resolved immediately after dispatch, before storing in context. Per-element mapping in `each` loops.
- **Workflow output `value`** uses `$steps` references to map from the final runtime context. Resolved after all steps complete. Exit step output takes precedence when fired.
- **Backwards compatibility** — outputs without `value` use legacy key-matching behavior. Legacy `source`/`default` fields are accepted at parse time and normalized to `value`.
- **Run log observability** — `StepRecord` includes `inputs` (resolved values passed to the executor), `retries` (attempt count + per-attempt error messages when retries occurred), and enriched `error` messages (prefixed with tool name for tool steps, step/field context for expression failures). These fields satisfy PR7/PR8 requirements for debugging artifacts.
- **Runtime events** — `RuntimeEvent` is a discriminated union on `type`, optional on `RunOptions`. Events emitted from runtime internals; rendering in `renderRuntimeEvent()` in `runtime/src/cli/format.ts`. All CLI live output goes to stderr; stdout reserved for JSON run log.
- **Every run attempt produces a run log** — parse failures, validation failures, and execution failures all produce a structured `RunLog` on stdout and disk. `runWorkflow()` returns a `RunLog` on validation failure (no longer throws `WorkflowExecutionError`). `buildFailedRunLog(name, error, startedAt?)` constructs the minimal log for pre-execution failures. `RunLogError` carries `phase: 'parse' | 'validate' | 'execute'`, `message`, and optional `details`. `WorkflowExecutionError` is kept exported for backwards compatibility but is no longer thrown by `runWorkflow()`.

## Development Commands

All commands run from `runtime/`:

```
cd runtime

npm run typecheck          # tsc --noEmit (strict)
npm run test               # Run all tests (vitest)
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # Build with tsdown
npm run validate:examples  # Validate all workflow fixtures

# CLI (via tsx for development)
npx tsx src/cli/index.ts validate <files...>
npx tsx src/cli/index.ts run <file>
```

## Workflow Generation

**Skill location: `.claude/skills/workflow-author/SKILL.md`**

To generate a workflow, invoke the skill with a description of the task:

```
/workflow-author fetch the top 10 Hacker News stories and return their titles, scores, and URLs
```

The skill researches the task (using WebFetch/WebSearch), proposes a design, writes the `.md` file, and validates it against the runtime CLI.

**Running a generated workflow:**

```
# Validate first (no API keys needed)
cd runtime && npx tsx src/cli/index.ts validate <path-to-workflow.md>

# Run it (requires ANTHROPIC_API_KEY for LLM steps, Google creds for Gmail/Sheets)
cd runtime && npx tsx src/cli/index.ts run <path-to-workflow.md>

# Pass inputs as JSON
cd runtime && npx tsx src/cli/index.ts run <path-to-workflow.md> -i '{"keywords": "rust developer"}'
```

The CLI shows live progress on stderr (step-by-step status, retries, iteration counts) and writes the full run log as JSON to stdout and to `runs/<name>-<timestamp>.json`. The run log contains:

- `status` — `success` or `failed`
- `steps[]` — per-step record with `id`, `status`, `duration_ms`, resolved `inputs`, `output`, and `error` (if any)
- `outputs` — the final workflow outputs
- `summary` — aggregate counts (steps executed/skipped, total tokens, total duration)

**Evaluating the output:** Check `status` for overall success. If a step failed, its `error` field explains why. For LLM steps, `tokens` shows usage. For `each` steps, `iterations` shows how many items were processed. The run log is the primary debugging artifact — if a workflow produces wrong results, compare the per-step `inputs` and `output` values against your expectations to find where the data flow broke down.

## Workflow Authoring Tests

`runtime/test/workflow-authoring/` contains an evaluation suite for the workflow-author skill.

**Running:**
```
cd runtime && npx vitest test/workflow-authoring/workflow-authoring.test.ts
```

**File layout:**
- `cases.ts` — 12 test cases, each with structural expectations + pattern checks mapped to SKILL.md rules
- `harness.ts` — `evaluate(content, evalCase)` runs all checks, returns per-check pass/fail + `skillRef`
- `scorecard.ts` — `buildScorecard()` + `formatScorecard()` — aggregates results, shows `[SKILL.md: ...]` failure annotations
- `workflow-authoring.test.ts` — Vitest runner; skips gracefully for missing fixtures
- `fixtures/` — Generated `.md` files (one per test case, committed after generation)

**Important:** The committed fixtures were generated by the skill at a point in time. The tests validate fixture content — they do not detect when a fixture is stale relative to SKILL.md. **After any meaningful change to SKILL.md, review which fixtures exercise the changed rule and regenerate them** to verify the skill actually produces better output. Passing tests after a SKILL.md edit only means the old fixtures still meet the quality bar — not that the skill improved.

**Improving the skill (iterative loop):**
1. **Generate:** `/workflow-author <prompt>` → save output to `runtime/test/workflow-authoring/fixtures/<id>.md`
2. **Evaluate:** run the test suite, read the scorecard
3. **Diagnose:** each failed check names the exact SKILL.md section to fix (e.g., `[SKILL.md: Rule 5 / "LLM Step" section]`)
4. **Improve:** edit `.claude/skills/workflow-author/SKILL.md` — strengthen the relevant rule/example
5. **Regenerate:** delete the fixture(s) that exercise the changed rule, re-run `/workflow-author`, save the new output
6. **Re-evaluate:** run tests again, verify the fix and check for regressions

## Credential Configuration

Set env vars or create a `.env` file in `runtime/`:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for LLM steps in workflows
GOOGLE_CLIENT_ID=...               # Optional: enables Gmail/Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

The CLI gracefully degrades: no API key → mock adapters with a warning. No Google creds → Google tools not registered (warning if workflow references them).
