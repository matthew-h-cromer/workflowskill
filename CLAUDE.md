# WorkflowSkill Reference Implementation

## Project Objective

We're building a reference implementation of the WorkflowSkill runtime as a standalone TypeScript package. `rfc-workflowskill.md` is the specification (source of truth for all behavior). `src/` is the implementation. The end goal: a user describes a workflow in natural language, an LLM generates WorkflowSkill YAML, and the runtime executes it. Target integration platform: OpenClaw (see OpenClaw Compatibility Guide below).

## Why We're Building This

1. **Workflows are the dominant use case** for AgentSkills. ~35-50% of skills on ClawHub involve multi-step orchestration. 9 of the top 10 autonomous agent use cases are workflows.

2. **Full LLM orchestration is wasteful for repeated workflows.** Most steps (fetch, filter, format, route) are deterministic. Only judgment steps (scoring, summarizing, deciding) need a model. Running everything through an LLM wastes tokens and money.

3. **LLM orchestration is unreliable for repeated workflows.** Probabilistic systems improvise. Output format drifts between runs. Steps get skipped. Error handling is ad hoc. Users abandon automations they can't trust.

4. **WorkflowSkill solves both problems at once.** Declare the plan, execute deterministic steps in a runtime, invoke models only where needed, handle errors explicitly. Cost drops ~98% in the email triage example. Every run follows the same path.

5. **Backwards compatibility is non-negotiable.** The extension lives inside SKILL.md as a fenced code block. Systems without a runtime read it as documentation. Nothing breaks. Adoption is incremental.

## How to Help

You are an implementation partner. Your job is to help build a working WorkflowSkill runtime. That means:

- **The RFC is the spec.** Read `rfc-workflowskill.md` before implementing any module. Every type, field, constraint, and runtime behavior is defined there. **Read the specific RFC sections relevant to the current step on-demand, not the entire file at once.** The "RFC Section Map" below tells you exactly which lines to read for each module.
- **Types first.** Get the TypeScript interfaces right before building on top of them. They're the contract between all modules.
- **Test as you go.** Every module should have passing tests before moving to the next. Use the targeted test workflows, not the complex RFC examples, for primary development.
- **Mock external dependencies.** No API calls in unit or integration tests. Use the adapter interfaces.
- **Commit after every completed roadmap step.** Don't accumulate changes across multiple steps. Each commit is a checkpoint you can recover from if context degrades later.
- **If the RFC is ambiguous, make a reasonable choice and document it in a code comment.**
- **If the RFC and the implementation disagree, the RFC wins.**

## Tech Stack

**TypeScript (strict), Node >=20, ESM** — Required. OpenClaw is TypeScript/Node. ESM is the module standard going forward.

**Test Framework: Vitest**
- Considered: Vitest, Jest, Node.js built-in test runner (node:test)
- Vitest wins on speed (4x faster cold start vs Jest, 10-20x in watch mode), native ESM support, zero-config TypeScript, and built-in coverage
- Jest has the largest ecosystem but ESM support is bolted-on, not native
- node:test has zero deps but lacks watch mode quality and ecosystem tooling
- OpenClaw uses Vitest, so this aligns for future integration

**Schema Validation: Zod**
- Considered: Zod, TypeBox, ArkType, Valibot
- TypeBox matches OpenClaw's codebase, but Zod has superior error messages and the most intuitive API for defining complex nested schemas (which we need for workflow step definitions)
- ArkType is 3-20x faster than Zod but has a heavier runtime and less mature ecosystem
- Valibot is 90% smaller than Zod but its functional composition API is less readable for complex nested structures
- Zod's `.parse()` with detailed error paths is ideal for giving authors actionable feedback on malformed workflows. We can swap to TypeBox during OpenClaw integration if needed, since the schema layer is isolated in `src/parser/schema.ts`

**YAML Parser: yaml (eemeli/yaml npm package)**
- Considered: yaml (eemeli), js-yaml
- `yaml` has built-in TypeScript types, YAML 1.2 compliance, active maintenance (2026 releases), and a three-tier API (simple parse/stringify, document model, low-level lexer/parser)
- js-yaml has no native TS types (requires @types), last major update ~2 years ago
- Both are zero-dependency. `yaml` is the modern choice.

**CLI Framework: Commander.js**
- Considered: Commander.js, yargs, raw process.argv
- Commander has zero dependencies, 20KB footprint, clean subcommand API, 281M weekly downloads
- yargs has 16 dependencies, 100KB+, more powerful but overkill for three commands
- Raw process.argv is too manual for help text, validation, subcommands
- We only need three commands (validate, run, generate). Commander is right-sized.

**Build Tool: tsdown**
- Considered: tsdown, tsup, esbuild direct, tsc only
- tsdown is the 2026 successor to tsup (which is no longer actively maintained). ESM-first, Rolldown foundation, fastest type declaration generation via --isolated-declarations
- OpenClaw is moving to tsdown. Aligning now prevents migration friction.
- tsc-only is too slow for iterative development. esbuild-direct requires too much config.

**LLM SDK: @anthropic-ai/sdk**
- Considered: @anthropic-ai/sdk, Vercel AI SDK, direct HTTP fetch
- The Anthropic SDK has excellent TypeScript types, native streaming, tool calling support, and is battle-tested for Claude workflows
- Vercel AI SDK offers multi-provider abstraction (15+ providers), which is valuable if we want to support model switching. But it adds abstraction we don't need yet.
- Direct HTTP is not recommended for production (maintenance burden)
- Start with @anthropic-ai/sdk. The LLM adapter interface (`src/adapters/llm-adapter.ts`) makes it straightforward to add Vercel AI SDK later if multi-provider support is needed.

## Architecture

Module map with responsibilities:

**`src/types/`** — TypeScript interfaces that mirror every field, type, and constraint in the RFC spec.
These are the contract between all modules. The parser outputs these types. The validator checks them. The executors consume them. Getting types right first prevents cascading errors across the codebase.

**`src/parser/`** — Extracts the `` ```workflow `` fenced code block from a SKILL.md file, parses the YAML, and validates the structure against Zod schemas to produce typed objects.
WorkflowSkill definitions live inside SKILL.md files as fenced code blocks (for backwards compatibility). We need to find the block in the markdown, parse the YAML, and validate that the structure conforms to the spec before we can do anything else. This is the entry point for all workflow processing.

**`src/expression/`** — Lexer, parser, and evaluator for the `$`-reference expression language (e.g., `$steps.fetch_emails.output.messages`, `$item.score >= 7`).
Expressions are used everywhere in a workflow: input wiring between steps, guard conditions, iteration targets, prompt templates, filter/map/sort logic. The expression language is small (references, property access, comparisons, logical operators) but it's the most cross-cutting dependency in the runtime. Every executor uses it.

**`src/validator/`** — Checks that a parsed workflow is valid before execution: DAG resolution (no cycles in step references), type compatibility between connected steps, tool availability, structural correctness per step type.
The RFC specifies a two-phase execution model: validate first, then execute. Catching errors before execution (missing tools, circular references, type mismatches) prevents confusing runtime failures and gives authors clear feedback.

**`src/executor/`** — Five step executors, one per step type (tool, llm, transform, conditional, exit). Each takes a step definition and runtime context, produces an output.
Each step type has different semantics. Tool steps invoke external tools. LLM steps call a model with an interpolated prompt. Transform steps do pure data manipulation (filter, map, sort). Conditional steps branch execution. Exit steps terminate the workflow. Separating them makes each testable in isolation.

**`src/runtime/`** — The orchestrator that ties everything together: validates the workflow, initializes context, executes steps in order following the 8-step lifecycle (guard → resolve → iterate → dispatch → validate output → handle errors → retry → record), and produces a structured run log.
This implements the execution model from the RFC. Without it, you have individual pieces (parser, evaluator, executors) but no way to run a workflow end-to-end.

**`src/adapters/`** — Abstract interfaces for tool invocation (`ToolAdapter`) and LLM calls (`LLMAdapter`), plus concrete implementations: mocks for testing, Anthropic SDK for production.
The runtime shouldn't know or care whether it's talking to a real API or a mock. Adapters let us test the full execution pipeline without API calls, and swap implementations when integrating with OpenClaw's tool registry.

**`src/generator/`** — The authoring skill: a SKILL.md that teaches any LLM to write valid WorkflowSkill YAML from natural language descriptions. Includes the skill definition, prompt engineering, and a validate-fix loop.
The RFC's authoring model says humans describe intent and agents generate the YAML. During development, we expose this as a CLI command for testing.

**`src/cli/`** — Three CLI commands: `validate` (check a workflow without running it), `run` (execute a workflow), `generate` (create a workflow from a prompt).
This is the developer interface: how we validate changes, run test workflows, and test the generator.

**`skills/workflow-author/SKILL.md`** — The publishable AgentSkill that teaches any LLM to author WorkflowSkill YAML. Contains YAML frontmatter, instructions, the spec reference, examples, and validation guidance.
This is a key deliverable alongside the RFC. Install this skill and your agent can write workflows. The `src/generator/` module provides the programmatic interface; the SKILL.md is the portable, platform-agnostic version.

**Dependency flow:** types → parser + expression → validator + executor → runtime → cli + generator

## Development Workflow

**Commit after every completed roadmap step.** Run the verification commands, then `git add` the relevant files and commit with a message like "Step N: <module name>". This is your safety net. If context gets compressed or the session ends, committed code survives.

After any change:
1. `npm run typecheck` — must pass
2. `npm run test` — must pass
3. `npm run lint` — must pass

For targeted iteration, run the specific test file: `npx vitest run test/unit/parser.test.ts`

Key npm scripts:
```
npm run build              # Build with tsdown
npm run test               # Run all tests (vitest)
npm run test:watch         # Watch mode for active development
npm run typecheck          # tsc --noEmit (strict)
npm run lint               # ESLint
npm run validate:examples  # Validate all example workflows
npx tsx src/cli/index.ts validate <file>
npx tsx src/cli/index.ts run <file>
npx tsx src/cli/index.ts generate "<prompt>"
```

## Testing Strategy

Unit tests per module in `test/unit/`. Integration tests in `test/integration/`. Mock adapters for tools and LLM (no API calls in unit/integration tests). Target: 90%+ line coverage.

### Test Workflows

Instead of using the complex RFC examples as the primary test cases, we use **minimal targeted workflows** that each isolate a specific capability. These are faster to write, easier to debug, and test one thing at a time.

| Test Workflow | Steps | What It Proves |
|--------------|-------|---------------|
| **echo** | 1 transform (map) | Parser works. Simplest execution path. Run log produced. Input passes to output. |
| **two-step-pipe** | tool → transform | Step-to-step data flow via `$steps` references. Expression resolution for `source` fields. |
| **llm-judgment** | tool → llm | LLM executor works. Prompt interpolation with `$steps` references. Token counting in run log. |
| **filter-exit** | tool → transform(filter) → conditional → exit | Transform filter with `$item` expressions. Conditional evaluation. Early exit. |
| **branch** | tool → conditional → exit(success) / exit(failed) | Conditional branching with `then`/`else`. Both paths tested. |
| **each-loop** | tool → llm(each) | `each` iteration. `$item` and `$index` resolution. Output is array of per-item results. |
| **error-fail** | tool(fails) → transform | `on_error: fail` halts workflow. Downstream step skipped. Run log records failure. |
| **error-ignore** | tool(fails) → transform | `on_error: ignore` continues. Downstream step receives null. Run log records both. |
| **retry-backoff** | tool(fails twice, succeeds third) | Retry with max, delay, backoff. Retriable vs. non-retriable errors. |
| **sort-pipeline** | tool → transform(sort) → transform(map) | Multi-transform chain. Sort by field/direction. Map reshaping. |

Each test workflow is a minimal SKILL.md file in `test/fixtures/`. Each has a corresponding integration test that executes it with mock adapters and asserts on the run log.

### Graduation Tests

Once all targeted tests pass, run the three RFC examples (email-triage, deploy-report, content-moderation) as **graduation tests**. These prove the system handles real-world complexity but aren't the primary development targets.

## Definition of Done

### By Module

| Module | Done When |
|--------|-----------|
| types | `tsc --noEmit` passes. Every RFC field, type, and constraint has a corresponding TypeScript type. |
| parser | All test fixtures parse correctly. Malformed YAML produces Zod errors with field paths. |
| expression | Every operator, reference type, and edge case (null, missing field, type coercion) has a passing test. |
| validator | DAG cycles detected. Type mismatches caught. Missing tools caught. All errors collected (not fail-fast). |
| executor (each) | Happy path and error cases pass for each of the 5 executor types with mock adapters. |
| runtime | All 10 targeted test workflows execute correctly. Run logs match RFC format. |
| cli | `validate`, `run`, and `generate` commands work from terminal. Exit codes correct. |
| generator / authoring skill | The SKILL.md is a valid AgentSkill. When used by an LLM, it produces valid WorkflowSkill YAML from natural language. Refinement loop fixes validation errors. |

### Overall

1. All 10 targeted test workflows pass
2. All 3 RFC graduation workflows pass
3. `npm run typecheck && npm run test && npm run lint` all pass
4. CLI commands work end-to-end
5. `workflow generate "summarize my slack channels daily"` produces valid YAML
6. `skills/workflow-author/SKILL.md` is a valid AgentSkill that an LLM can use to author workflows
7. 90%+ test coverage

## Coding Conventions

- All types in `src/types/`, imported everywhere else
- Zod schemas in `src/parser/schema.ts` are the runtime validation layer
- Adapters (`src/adapters/`) isolate all external dependencies (tools, LLM)
- Every public function has a corresponding test
- Error messages include context: which step failed, what expression was invalid, expected vs. actual type
- When in doubt about runtime behavior, read the RFC (`rfc-workflowskill.md`). It's the spec.
- If the RFC is ambiguous, make a reasonable choice and document it in a code comment.

## Implementation Roadmap

**Step 1: Project scaffolding**
Create package.json, tsconfig.json (strict), vitest.config.ts, .eslintrc.cjs, .gitignore, and the directory structure under `src/` and `test/`. Install dependencies. Verify the build/test/lint/typecheck loop works with empty files. **Commit.**

**Step 2: Type definitions** (RFC lines 193-253, 260-301, 334-401)
Define TypeScript interfaces in `src/types/` that are a precise mirror of every field and constraint in the RFC. This is the contract between all modules. Must compile with `tsc --noEmit`. **Commit.**

**Step 3: Parser** (RFC lines 193-253, 260-301)
Build the SKILL.md → typed WorkflowDefinition pipeline. Extract the `` ```workflow `` fenced block from markdown. Parse YAML with `yaml`. Validate structure with Zod schemas. Create the test fixture files (10 targeted workflows + malformed files). **Commit.**

**Step 4: Expression evaluator** (RFC lines 303-332)
Build the lexer, recursive-descent parser, and evaluator for the `$`-reference expression language. This is the most cross-cutting module. Every executor depends on it. Also build the prompt template interpolator (resolve references in strings). **Commit.**

**Step 5: Validator** (RFC lines 402-423, 552-565)
Implement pre-execution validation: DAG resolution, type checking between steps, tool availability, structural correctness. Must return all errors, not just the first. **Commit.**

--- Phase 1 complete (steps 1-5). Commit and verify: `npm run typecheck && npm run test && npm run lint` ---

**Step 6: Step executors + adapters** (RFC lines 425-488, 490-499)
Define the ToolAdapter and LLMAdapter interfaces. Build mock implementations. Implement all 5 executors (transform first since it's pure data, then conditional, exit, tool, llm). **Commit.**

**Step 7: Runtime orchestrator** (RFC lines 402-565)
Wire everything together: the execution loop that validates, initializes context, runs steps through the 8-step lifecycle, handles errors and retries, and produces the run log. This is where the 10 targeted test workflows get their integration tests. **Commit.**

**Step 8: CLI**
Three commands: validate, run, generate. This is the developer interface and the primary way to interact with the system. **Commit.**

**Step 9: Workflow authoring skill** (RFC lines 146-192 for authoring model)
Build a SKILL.md file that teaches any LLM to generate valid WorkflowSkill YAML from natural language descriptions. This skill is a publishable AgentSkill artifact: people drop it into their agent and it gains the ability to write workflows. The `src/generator/` module contains the prompt engineering, the Zod-based validation loop, and the CLI wrapper for development testing. The skill file itself lives in `skills/workflow-author/SKILL.md`. **Commit.**

## RFC Section Map

The RFC at `rfc-workflowskill.md` defines every type, field, constraint, and runtime behavior. **Read sections on-demand as you work on each module.** Don't load the entire file.

| RFC Lines | Section | Read When Implementing |
|-----------|---------|----------------------|
| 44-63 | Context (definitions) | Types (for term definitions) |
| 146-192 | Proposal requirements (PR1-PR11) and Authoring Model | Generator / authoring skill |
| 193-253 | WorkflowSkill YAML structure, step field definitions | Types, Parser |
| 256-259 | Backwards compatibility (fenced block placement) | Parser |
| 260-301 | Workflow inputs/outputs with schema examples | Types, Parser |
| 303-332 | Expression language (references, operators, constraints, prompt interpolation) | Expression evaluator |
| 334-401 | Step types: tool, llm, transform, conditional, exit (field tables, flow control) | Types, Executors |
| 402-423 | Runtime execution model (two phases, 8-step lifecycle) | Runtime orchestrator |
| 425-488 | Step executors (tool, llm, transform with filter/map/sort, conditional, exit) | Executors |
| 490-499 | Error handling (on_error, retry semantics) | Runtime, Executors |
| 501-533 | Run log format (fields, step records) | Runtime |
| 535-550 | Runtime boundaries (what the runtime does vs. platform responsibilities) | Runtime, Adapters |
| 552-565 | Conformance requirements (8 rules) | Validator, Runtime |
| 567-722 | Example 1: Email triage (graduation test) | Integration tests |
| 723-832 | Example 2: Deployment report, zero LLM tokens (graduation test) | Integration tests |
| 833-1022 | Example 3: Content moderation with conditional branching (graduation test) | Integration tests |

The implementation must match the RFC. If there's a discrepancy, the RFC wins.

---

## Ecosystem Context

### The AgentSkill Standard
- Created by Anthropic, released December 2025. Open standard at agentskills.io.
- Spec repo: github.com/agentskills/agentskills (10.4k stars, 596 forks).
- Adopted by 27+ agent products: Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, Gemini CLI, Goose, Windsurf, and more.
- Governed under the Agentic AI Foundation (AAIF) at the Linux Foundation, alongside MCP and AGENTS.md.
- A skill is a directory with a SKILL.md file (YAML frontmatter + Markdown body). Optional scripts/, references/, assets/ directories.
- Progressive disclosure model: metadata (~100 tokens) loaded at startup, full instructions loaded on activation, resources loaded on demand.

### Key Active Proposals on the AgentSkill Spec
These are relevant context. Our implementation should be aware of them but not depend on them:
- **Standard skill folder location** (#15): `.agents/skills/` as universal path. 16+ agents adopted. Claude Code pending.
- **Capabilities field for security** (#170): Declaring shell/filesystem/network/browser access. Motivated by Snyk's ToxicSkills research (13.4% of skills have critical security issues).
- **Dynamic context injection** (#124): Inline command substitution (`!command`) in SKILL.md.
- **Path-based recursive discovery** (#115): `.agents/skills/` anywhere in project tree.
- **Skill dependencies with version validation** (#110): Testing spec and dependency management.
- **Cloudflare discovery RFC**: `.well-known/skills/` URI for web-based skill discovery.

### OpenClaw Compatibility Guide

OpenClaw is the target integration platform (196k+ stars, TypeScript/Node). We don't need to clone or read its source during implementation. Instead, follow these compatibility requirements so the runtime can integrate smoothly later.

**Module system:** ESM only (`"type": "module"` in package.json). No CommonJS.

**Build tooling:** tsdown (aligns with OpenClaw's move from tsup). Output to `dist/` with `.d.ts` type declarations.

**Package manager:** OpenClaw uses pnpm in a monorepo (`pnpm-workspace.yaml`). Our standalone package should work with both npm and pnpm. Avoid npm-specific features.

**Schema validation layer:** OpenClaw uses **TypeBox + AJV** for tool schemas and gateway protocol, and **Zod** for configuration validation. We use Zod for workflow parsing (better error messages for authors). The schema layer is isolated in `src/parser/schema.ts`, so swapping to TypeBox during integration is a contained change.

**Test framework:** Vitest (same as OpenClaw). OpenClaw targets 70%+ coverage. We target 90%+.

**Tool invocation interface:** Tools are typed JSON schema definitions with `id`, `name`, `arguments` (structured object). MCP tools use JSON-RPC: `{"jsonrpc": "2.0", "method": "tools/call", "params": {toolName, arguments}}`. Our `ToolAdapter` interface must accept a tool name + structured arguments object and return a structured result. This is the critical integration surface.

**Plugin architecture:** OpenClaw has four extension slots: Channel, Tool, Memory, Provider. A WorkflowSkill runtime would register as a **Tool Extension** via `openclaw.extensions` in package.json. The plugin exposes a tool that accepts workflow definitions and returns structured execution results.

**Skill loading:** OpenClaw discovers skills from `<workspace>/skills/`, `~/.openclaw/skills/`, and bundled locations. Skills are directories with SKILL.md files. Frontmatter includes `metadata.openclaw` for runtime requirements. Our ````workflow` fenced block lives inside SKILL.md and doesn't require frontmatter changes.

**Lobster (existing workflow engine):** OpenClaw already has Lobster, a typed pipeline shell with approval gates. Lobster is OpenClaw-specific, not a cross-platform standard. WorkflowSkill is complementary, not competing. Lobster uses `{{step.output}}` template syntax vs. our `$steps.id.output` expressions. The two can coexist.

**What this means for implementation:**
- The `ToolAdapter` interface is the integration boundary. Keep it clean: `invoke(toolName: string, args: Record<string, unknown>): Promise<unknown>`
- The `LLMAdapter` interface should match OpenClaw's model invocation pattern: model name string, prompt, optional structured output hint
- Export all types from a single entry point (`src/index.ts`) for clean package consumption
- Don't depend on OpenClaw internals. The runtime is a standalone package that OpenClaw wraps.

### The Layered Agent Architecture
The ecosystem is converging on complementary layers:
```
Layer 4: Agent-to-Agent (A2A, Google)     -- agents collaborate
Layer 3: Skills (AgentSkill)              -- reusable procedures and knowledge
Layer 2: Tool Connectivity (MCP)          -- standardized tool access
Layer 1: Function Calling (provider APIs) -- model-level tool invocation
Layer 0: Project Guidance (AGENTS.md)     -- repo-level conventions
```

WorkflowSkill operates at Layer 3. It makes skills executable rather than just instructional. It depends on Layer 2 (tools are invoked via MCP or equivalent) but does not modify it.

### What the Ecosystem Is Missing (Our Opportunity)
The gap between atomic tool definitions (MCP) and free-form instructions (skills) has no standard solution for:
- Execution contracts (expected outcomes, success criteria)
- State management across multi-step execution
- Error recovery patterns
- Parameterized invocation (typed inputs/outputs vs. description matching)
- Skill composition (one skill invoking another)
- Versioning and testing

WorkflowSkill addresses all of these.

## Competitive/Alternative Approaches
Be aware of these so the implementation can address "why not just use X?":
- **LangGraph**: Graph-based workflow orchestration. Powerful but framework-specific, Python-only, not a standard.
- **CrewAI**: Role-based agent teams. More about multi-agent coordination than workflow definition.
- **Temporal/Prefect/Airflow**: Production workflow engines. Too heavy for agent skills. Different abstraction level.
- **Haystack**: Python pipeline framework (24.2k stars). Validates the core thesis: separates deterministic and LLM steps, achieves lowest token usage among comparable frameworks. But framework-not-standard, Python-only, code-first. Evidence for WorkflowSkill, not competition against it.
- **flowmind**: Community-built OpenClaw meta-skill for chaining skills. Proves demand. WorkflowSkill is the standardized answer.
