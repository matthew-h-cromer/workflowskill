---
paths:
  - "test/**"
---

# Testing

## Test Files

| File | What It Covers |
| --- | --- |
| `test/unit/types.test.ts` | Type compilation checks (incl. JsonSchema, ToolDescriptor, ToolAdapter) |
| `test/unit/parser.test.ts` | YAML parsing, Zod validation, malformed input errors, output source field |
| `test/unit/expression.test.ts` | Lexer, parser, evaluator, prompt interpolation, $result reference |
| `test/unit/validator.test.ts` | DAG cycles, type mismatches, missing tools, structural correctness |
| `test/unit/executor.test.ts` | All 5 executor types: transform, conditional, exit, tool, llm |
| `test/unit/adapters.test.ts` | MockToolAdapter |
| `test/unit/config.test.ts` | loadConfig: env vars, .env fallback, precedence |
| `test/unit/anthropic-llm-adapter.test.ts` | Anthropic SDK adapter: call(), model aliases, responseFormat |
| `test/unit/web-scrape.test.ts` | web.scrape tool (fetch + CSS extraction) |
| `test/unit/builtin-tool-adapter.test.ts` | BuiltinToolAdapter registration and invocation |
| `test/integration/runtime.test.ts` | All 12 targeted workflows end-to-end with mock adapters |
| `test/integration/graduation.test.ts` | 3 spec examples: email-triage, deploy-report, content-moderation |

## Test File Naming

`test/unit/<module>.test.ts` mirrors `src/<module>/`. Integration tests in `test/integration/`.

## Fixture Directory Helper

Use `import.meta.dirname` (Node >=21.2) for ESM fixture paths:

```typescript
import { join } from 'node:path';
const FIXTURES = join(import.meta.dirname, '../fixtures');
```

## Mock Adapters

Instantiate per-test, not in `beforeEach`:

- `MockLLMAdapter` — constructor takes a response factory function
- `MockToolAdapter` — use `.register(name, handler)` to add tools

## Fixtures

12 targeted: echo, two-step-pipe, llm-judgment, filter-exit, branch, each-loop, error-fail, error-ignore, retry-backoff, sort-pipeline, output-source, output-source-with-exit

3 graduation: graduation-email-triage, graduation-deploy-report, graduation-content-moderation

4 malformed: malformed-bad-schema, malformed-bad-yaml, malformed-no-block, malformed-no-frontmatter

## Workflow Authoring Evaluation

`test/workflow-authoring/` evaluates the workflow-author skill (SKILL.md) against 12 test cases.

| File | What It Does |
| --- | --- |
| `test/workflow-authoring/cases.ts` | 12 EvalCase definitions + reusable PatternCheck functions (each mapped to a SKILL.md rule) |
| `test/workflow-authoring/harness.ts` | `evaluate(content, evalCase)` — runs parse/validate + structural + pattern checks |
| `test/workflow-authoring/scorecard.ts` | `buildScorecard()` + `formatScorecard()` — aggregates results, annotates failures with `[SKILL.md: ...]` |
| `test/workflow-authoring/workflow-authoring.test.ts` | Vitest runner with `beforeAll` per case; prints scorecard in `afterAll` |
| `test/workflow-authoring/fixtures/` | 12 generated `.md` files (one per test case, committed) |

**Pattern checks return `true` (pass) or a string (failure detail).** The harness uses `result === true` strict comparison — not truthiness — because non-empty strings are truthy in JavaScript.
