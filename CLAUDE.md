# WorkflowSkill Reference Implementation

## Project Overview

A standalone TypeScript runtime that parses, validates, and executes WorkflowSkill YAML definitions. A user describes a workflow in natural language, an LLM generates WorkflowSkill YAML, and the runtime executes it. `rfc-workflowskill.md` is the specification (source of truth for all behavior). Target integration platform: OpenClaw.

**Status: Core implementation complete.** All 9 roadmap steps done. 150 tests passing, 92.93% statement / 94.42% line coverage. CLI working end-to-end. Ready for real LLM/tool integration.

## How to Help

- **The RFC is the spec.** Read `rfc-workflowskill.md` before modifying any module. If the RFC and the implementation disagree, the RFC wins.
- **Test as you go.** Every change must pass `npm run typecheck && npm run test && npm run lint`.
- **Mock external dependencies.** No API calls in unit or integration tests. Use the adapter interfaces.
- **Keep CLAUDE.md current.** After completing any iteration, update this file to reflect what changed.
- **If the RFC is ambiguous, make a reasonable choice and document it in a code comment.**

## Tech Stack

TypeScript (strict), Node >=20, ESM only. Vitest for tests. Zod for schema validation. `yaml` (eemeli) for YAML parsing. Commander.js for CLI. tsdown for builds. `@anthropic-ai/sdk` planned for production LLM adapter (not yet implemented).

## Architecture

```
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
├── adapters/       # ToolAdapter/LLMAdapter interfaces + mock implementations
├── generator/      # Generate-validate-fix loop for LLM-authored workflows
├── cli/            # Three commands: validate, run, generate
└── index.ts        # Single entry point re-exporting all public APIs

skills/workflow-author/SKILL.md  # Publishable AgentSkill that teaches LLMs to author workflows
test/fixtures/                   # 10 targeted + 3 graduation workflow fixtures
test/unit/                       # Unit tests (parser, expression, types, validator, executor, generator)
test/integration/                # Integration tests (runtime, graduation)
```

**Dependency flow:** types → parser + expression → validator + executor → runtime → cli + generator

## Key Design Decisions

- **LLM executor does NOT wrap output** in the first output key. Output is stored directly (like tool steps). This ensures `$steps.<id>.output.field` works consistently across step types.
- **Transform executor DOES wrap output** in the first declared output key (e.g., `{ filtered: [...] }`), since transforms produce arrays that need naming.
- **ExitStep.output** supports both `string` (expression) and `Record<string, unknown>` (object literal with resolvable values). The RFC examples use both forms.
- **Branch steps** (those referenced in conditional then/else) are collected upfront and skipped during sequential execution, only run when selected by a conditional.
- **`each` iteration** is handled by the runtime, not the executor. The runtime calls the executor once per item with `$item`/`$index` in context.

## Development Commands

```
npm run typecheck          # tsc --noEmit (strict)
npm run test               # Run all 150 tests (vitest)
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # Build with tsdown
npm run validate:examples  # Validate all 13 valid workflow fixtures

# CLI (via tsx for development)
npx tsx src/cli/index.ts validate <files...>
npx tsx src/cli/index.ts run <file>
npx tsx src/cli/index.ts generate "<prompt>"
```

## Test Suite

**150 tests** across 8 test files:

| File | Tests | What It Covers |
|------|-------|---------------|
| `test/unit/types.test.ts` | Type compilation checks |
| `test/unit/parser.test.ts` | YAML parsing, Zod validation, malformed input errors |
| `test/unit/expression.test.ts` | Lexer, parser, evaluator, prompt interpolation |
| `test/unit/validator.test.ts` | DAG cycles, type mismatches, missing tools, structural correctness |
| `test/unit/executor.test.ts` | All 5 executor types: transform, conditional, exit, tool, llm |
| `test/unit/generator.test.ts` | Generate-validate-fix loop, retry on failure, raw YAML wrapping |
| `test/integration/runtime.test.ts` | All 10 targeted workflows end-to-end with mock adapters |
| `test/integration/graduation.test.ts` | 3 RFC examples: email-triage, deploy-report, content-moderation |

**Coverage:** 92.93% statements, 83.69% branches, 97.72% functions, 94.42% lines.

### Test Fixtures (`test/fixtures/`)

10 targeted workflows (each isolates a specific capability):
echo, two-step-pipe, llm-judgment, filter-exit, branch, each-loop, error-fail, error-ignore, retry-backoff, sort-pipeline

3 graduation workflows (real-world complexity from RFC examples):
graduation-email-triage, graduation-deploy-report, graduation-content-moderation

4 malformed fixtures (error handling):
malformed-bad-schema, malformed-bad-yaml, malformed-no-block, malformed-no-frontmatter

## Public API (`src/index.ts`)

All public types and functions are re-exported from the package entry point:

- **Types:** All interfaces from `src/types/` (WorkflowDefinition, Step variants, RunLog, etc.)
- **Parser:** `parseSkillMd`, `parseWorkflowYaml`, `parseWorkflowFromMd`, `ParseError`
- **Expression:** `resolveExpression`, `interpolatePrompt`, `LexError`, `ParseExprError`, `EvalError`
- **Validator:** `validateWorkflow`
- **Executors:** `dispatch`, `executeTransform`, `executeConditional`, `executeExit`, `executeTool`, `executeLLM`, `StepExecutionError`
- **Runtime:** `runWorkflow`, `WorkflowExecutionError`
- **Generator:** `generateWorkflow`
- **Adapters:** `MockToolAdapter`, `MockLLMAdapter`

## RFC Section Map

The RFC at `rfc-workflowskill.md` defines every type, field, constraint, and runtime behavior.

| RFC Lines | Section | Relevant Module |
|-----------|---------|----------------|
| 44-63 | Context (definitions) | types |
| 146-192 | Proposal requirements, Authoring Model | generator |
| 193-253 | YAML structure, step fields | types, parser |
| 256-259 | Backwards compatibility | parser |
| 260-301 | Workflow inputs/outputs | types, parser |
| 303-332 | Expression language | expression |
| 334-401 | Step types (tool, llm, transform, conditional, exit) | types, executor |
| 402-423 | Runtime execution model (two phases, 8-step lifecycle) | runtime |
| 425-488 | Step executors | executor |
| 490-499 | Error handling (on_error, retry) | runtime, executor |
| 501-533 | Run log format | runtime |
| 535-550 | Runtime boundaries | runtime, adapters |
| 552-565 | Conformance requirements | validator, runtime |
| 567-722 | Example 1: Email triage | test/integration/graduation |
| 723-832 | Example 2: Deployment report | test/integration/graduation |
| 833-1022 | Example 3: Content moderation | test/integration/graduation |

## Coding Conventions

- All types in `src/types/`, imported everywhere else
- Zod schemas in `src/parser/schema.ts` are the runtime validation layer
- Adapters (`src/adapters/`) isolate all external dependencies (tools, LLM)
- Every public function has a corresponding test
- Error messages include context: which step failed, what expression was invalid, expected vs. actual type
- The `ToolAdapter` interface is the integration boundary: `invoke(toolName, args) → Promise<unknown>`
- The `LLMAdapter` interface: `call(model, prompt) → Promise<{ text, tokens }>`

## Completed Roadmap

All 9 steps are implemented and committed:

| Step | Module | Commit |
|------|--------|--------|
| 1 | Project scaffolding | `80428a4` |
| 2 | Type definitions | `604fa8f` |
| 3 | Parser + test fixtures | `4359b2b` |
| 4 | Expression evaluator | `991850c` |
| 5 | Validator | `6aa3d67` |
| 6 | Step executors + adapters | `3050f96` |
| 7 | Runtime orchestrator | `18a586e` |
| 8 | CLI commands | `2aef1db` |
| 9 | Workflow authoring skill | `248ebef` |

## Possible Next Steps

These are not committed to — they represent natural directions for the project:

- **Real LLM adapter** — Implement `@anthropic-ai/sdk` adapter so `generate` calls Claude instead of using a mock template
- **Real tool adapter** — Connect to MCP servers or OpenClaw's tool registry for actual tool execution
- **OpenClaw plugin packaging** — Register as a Tool Extension, wire into OpenClaw's plugin architecture
- **npm publish prep** — `dist/` build output, `exports` field, consumable as a library
- **Streaming/progress** — Runtime events or callbacks for observing step execution in real-time

## OpenClaw Compatibility

OpenClaw is the target integration platform. Key compatibility decisions already in place:

- **ESM only** (`"type": "module"`)
- **tsdown** for builds (aligns with OpenClaw's tooling direction)
- **Vitest** for tests (same as OpenClaw)
- **Zod** for schema validation (isolated in `src/parser/schema.ts`, swappable to TypeBox)
- **ToolAdapter/LLMAdapter** interfaces are the integration boundary — OpenClaw wraps this package
- **Single entry point** (`src/index.ts`) exports all public APIs
- Plugin would register as a **Tool Extension** via `openclaw.extensions` in package.json
