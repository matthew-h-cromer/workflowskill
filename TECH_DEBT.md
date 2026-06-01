# Tech Debt

## [2026-04-29] src/interpreter/expressions/jsonata.ts:46-53
`sanitizeJsonata` mutates the JSONata result object in-place for the object branch while the array branch correctly returns a new value via `Array.from()`. If expression compilation is ever memoized this will corrupt cached results — should use `Object.fromEntries()` instead of mutating.

## [2026-04-29] src/runtime/retry.ts
`applyRetry` uses deterministic exponential backoff with no jitter. Under concurrent workflows retrying the same flaky action this creates thundering herd. No unit tests exist for this function at all — both the missing jitter and missing tests are defects in a production retry implementation.

## [2026-04-29] src/cli/index.ts:15
CLI version is hardcoded as `"1.0.0"` while `package.json` is `"0.9.0"`. `workflowskill --version` outputs the wrong version on every release. Should read from `package.json` at build time.

## [2026-04-29] src/interpreter/errors.ts:16-23
`WorkflowAbortError` is defined and exported but never thrown anywhere in the codebase and is not re-exported from the public entry point. Dead code that misleads consumers expecting the runtime to throw it.

## [2026-04-29] src/interpreter/index.ts:182 and src/validate/walk.ts:26
Two exported functions share the name `walkSteps` — one is an async runtime step executor, the other a sync static-analysis visitor. Naming collision is a confusion risk for third-party runtime implementors reading the code.

## [2026-04-29] src/toolkit/weldable/mock.ts:30
Unresolved `// Open question:` comment in published code about whether mock throws model errors vs infra errors — a design decision that affects `try/catch` step behavior in mock vs production execution.

## [2026-04-29] evals/checks.ts:323
`assertPassesValidate` defaults `dryRun: false` despite the name and docstring implying full static validation. Foreach-on-scalar and other dry-run errors pass silently and get committed to eval snapshots as false positives.

## [2026-04-29] evals/setup.ts:64
`MODEL` hardcoded as `"claude-sonnet-4-6"`. When the model ID changes, evals silently run against a different model with no signal that snapshots need regeneration.
