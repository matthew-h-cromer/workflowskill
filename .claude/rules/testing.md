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
| `test/unit/generator.test.ts` | Single-shot generation, validation failure, toolDescriptors, conversational |
| `test/unit/conversation.test.ts` | Conversation loop: direct gen, multi-turn, pause_turn, server_tool passthrough |
| `test/unit/adapters.test.ts` | MockToolAdapter + MockLLMAdapter |
| `test/unit/config.test.ts` | loadConfig: env vars, .env fallback, precedence |
| `test/unit/anthropic-llm-adapter.test.ts` | Anthropic SDK adapter: model aliases, server-side tools, pause_turn |
| `test/unit/http-request.test.ts` | http.request tool |
| `test/unit/html-select.test.ts` | html.select tool |
| `test/unit/gmail.test.ts` | Gmail tools |
| `test/unit/sheets.test.ts` | Sheets tools |
| `test/unit/builtin-tool-adapter.test.ts` | BuiltinToolAdapter registration and invocation |
| `test/integration/runtime.test.ts` | All 12 targeted workflows end-to-end with mock adapters |
| `test/integration/graduation.test.ts` | 3 RFC examples: email-triage, deploy-report, content-moderation |

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
