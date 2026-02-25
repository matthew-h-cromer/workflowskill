# File Cascades

When changing one file, these related files likely need updates too.

## Adding/changing a public type

`runtime/src/types/index.ts` → `runtime/src/parser/schema.ts` (Zod schema) → `runtime/src/index.ts` (re-export) → tests

## Adding/changing a public function

Implementation file → `runtime/src/index.ts` (re-export) → tests → CLAUDE.md (if significant)

## Generator changes

`runtime/src/generator/*.ts` + `runtime/src/types/index.ts` + `runtime/src/cli/generate.ts` + `runtime/src/index.ts` + tests

## Workflow-author skill

`runtime/src/generator/workflow-author.md` → run `npx tsx scripts/generate-skill-prompt.ts` (from `runtime/`) → verify `runtime/src/generator/skill-prompt.ts` updated

## New built-in tool

`runtime/src/adapters/tools/<name>.ts` → `runtime/src/adapters/builtin-tool-adapter.ts` (register) → tests → CLAUDE.md (Built-in Tools)

## Spec-level changes

`runtime/src/types/` → `runtime/src/parser/schema.ts` → `runtime/src/validator/` → `runtime/src/executor/` → `runtime/src/runtime/` → tests → CLAUDE.md
