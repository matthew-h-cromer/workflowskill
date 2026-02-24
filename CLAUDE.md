# WorkflowSkill Reference Implementation

## Project Overview

A standalone TypeScript runtime that parses, validates, and executes WorkflowSkill YAML definitions. A user describes a workflow in natural language, an LLM generates WorkflowSkill YAML, and the runtime executes it. `SPEC.md` is the specification (source of truth for all behavior). See also `PROPOSAL.md` (justification and alternatives) and `examples/` (real-world workflow examples).

## Verify Every Change

**Run after every change:** `npm run typecheck && npm run test && npm run lint`

- **The spec is the source of truth.** Read `SPEC.md` before modifying any module. If the spec and the implementation disagree, the spec wins.
- **Mock external dependencies.** No API calls in unit or integration tests. Use the adapter interfaces.
- **Keep CLAUDE.md current.** After completing any iteration, update this file to reflect what changed.
- **If the spec is ambiguous, make a reasonable choice and document it in a code comment.**

## Do Not Edit

- **`src/generator/skill-prompt.ts`** — auto-generated from `src/generator/workflow-author.md`. Edit the `.md`, then run `npx tsx scripts/generate-skill-prompt.ts`.
- **`package-lock.json`** — managed by npm.

## Engineering Principles

- **No silent fallbacks.** Throw clear errors. Never silently degrade.
- **Fix root causes, not symptoms.** Fix the prompt, not the extraction logic.
- **Improve the skill, not the parser.** When LLM output causes runtime failures, fix the workflow-author skill to generate better prompts — don't add parsing heuristics to the executor. Other spec implementations won't share custom parsing logic.

## Architecture

````
src/
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
├── runtime/        # Orchestrator: validate → init context → 8-step lifecycle → run log
├── config/         # loadConfig() — env vars with .env fallback
├── adapters/       # ToolAdapter/LLMAdapter interfaces + implementations
│   ├── mock-tool-adapter.ts    # Mock for testing
│   ├── mock-llm-adapter.ts     # Mock for testing
│   ├── anthropic-llm-adapter.ts # Real Anthropic SDK adapter
│   ├── builtin-tool-adapter.ts  # Registers all built-in tools
│   └── tools/                   # Built-in tool implementations
│       ├── http-request.ts      # http.request (Node fetch)
│       ├── html-select.ts       # html.select (cheerio)
│       ├── gmail.ts             # gmail.search, gmail.read, gmail.send
│       └── sheets.ts            # sheets.read, sheets.write, sheets.append
├── generator/      # LLM-powered workflow generation (single-shot and conversational)
│   ├── workflow-author.md  # Skill prompt that teaches LLMs to author workflows
│   ├── skill-prompt.ts     # Auto-generated TS export of workflow-author.md
│   └── conversation.ts     # Multi-turn conversational generation loop
├── cli/            # Three commands: validate, run, generate
└── index.ts        # Single entry point re-exporting all public APIs

test/fixtures/                   # 12 targeted + 3 graduation + 4 malformed workflow fixtures
test/unit/                       # Unit tests (parser, expression, types, validator, executor, generator)
test/integration/                # Integration tests (runtime, graduation)
````

**Dependency flow:** types → parser + expression → validator + executor → runtime → cli + generator

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
- **Runtime events** use the same `onEvent` callback pattern as `ConversationEvent` in the generator. `RuntimeEvent` is a discriminated union on `type`, optional on `RunOptions`. Events emitted from runtime internals; rendering in `renderRuntimeEvent()` in `src/cli/format.ts`. All CLI live output goes to stderr; stdout reserved for JSON run log.
- **Every run attempt produces a run log** — parse failures, validation failures, and execution failures all produce a structured `RunLog` on stdout and disk. `runWorkflow()` returns a `RunLog` on validation failure (no longer throws `WorkflowExecutionError`). `buildFailedRunLog(name, error, startedAt?)` constructs the minimal log for pre-execution failures. `RunLogError` carries `phase: 'parse' | 'validate' | 'execute'`, `message`, and optional `details`. `WorkflowExecutionError` is kept exported for backwards compatibility but is no longer thrown by `runWorkflow()`.

## Development Commands

```
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
npx tsx src/cli/index.ts generate "<prompt>"
```

## Credential Configuration

Set env vars or create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for real LLM calls
GOOGLE_CLIENT_ID=...               # Optional: enables Gmail/Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

The CLI gracefully degrades: no API key → mock adapters with a warning. No Google creds → Google tools not registered (warning if workflow references them).
