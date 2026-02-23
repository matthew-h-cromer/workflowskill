# File Cascades

When changing one file, these related files likely need updates too.

## Adding/changing a public type

`src/types/index.ts` → `src/parser/schema.ts` (Zod schema) → `src/index.ts` (re-export) → tests

## Adding/changing a public function

Implementation file → `src/index.ts` (re-export) → tests → CLAUDE.md (if significant)

## Generator changes

`src/generator/*.ts` + `src/types/index.ts` + `src/cli/generate.ts` + `src/index.ts` + tests

## Workflow-author skill

`src/generator/workflow-author.md` → run `npx tsx scripts/generate-skill-prompt.ts` → verify `src/generator/skill-prompt.ts` updated

## New built-in tool

`src/adapters/tools/<name>.ts` → `src/adapters/builtin-tool-adapter.ts` (register) → tests → CLAUDE.md (Built-in Tools)

## Spec-level changes

`src/types/` → `src/parser/schema.ts` → `src/validator/` → `src/executor/` → `src/runtime/` → tests → CLAUDE.md
