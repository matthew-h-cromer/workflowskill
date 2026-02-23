# WorkflowSkill Reference Implementation

## Project Overview

A standalone TypeScript runtime that parses, validates, and executes WorkflowSkill YAML definitions. A user describes a workflow in natural language, an LLM generates WorkflowSkill YAML, and the runtime executes it. `rfc-workflowskill.md` is the specification (source of truth for all behavior).

## Verify Every Change

**Run after every change:** `npm run typecheck && npm run test && npm run lint`

- **The RFC is the spec.** Read `rfc-workflowskill.md` before modifying any module. If the RFC and the implementation disagree, the RFC wins.
- **Mock external dependencies.** No API calls in unit or integration tests. Use the adapter interfaces.
- **Keep CLAUDE.md current.** After completing any iteration, update this file to reflect what changed.
- **If the RFC is ambiguous, make a reasonable choice and document it in a code comment.**

## Do Not Edit

- **`src/generator/skill-prompt.ts`** — auto-generated from `src/generator/workflow-author.md`. Edit the `.md`, then run `npx tsx scripts/generate-skill-prompt.ts`.
- **`package-lock.json`** — managed by npm.

## Engineering Principles

- **No silent fallbacks.** Throw clear errors. Never silently degrade.
- **Fix root causes, not symptoms.** Fix the prompt, not the extraction logic.

## Architecture

````
src/
├── types/          # TypeScript interfaces mirroring every RFC field and constraint
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
- **ExitStep.output** supports both `string` (expression) and `Record<string, unknown>` (object literal with resolvable values). The RFC examples use both forms.
- **Branch steps** (those referenced in conditional then/else) are collected upfront and skipped during sequential execution, only run when selected by a conditional.
- **`each` iteration** is handled by the runtime, not the executor. The runtime calls the executor once per item with `$item`/`$index` in context.
- **Step output `source`** uses `$output` to map from the raw executor result. Resolved immediately after dispatch, before storing in context. Per-element mapping in `each` loops.
- **Workflow output `source`** uses `$steps` references to map from the final runtime context. Resolved after all steps complete. Exit step output takes precedence when fired.
- **Backwards compatibility** — outputs without `source` use legacy key-matching behavior.

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
