# WorkflowSkill

Declarative workflow language + TypeScript runtime for orchestrating tool-calling agents.

## Spec

`SPEC.md` is the authoritative source of truth. Read the relevant section before modifying any runtime module. See `.claude/rules/spec-map.md` for the section→module mapping.

## Repo Structure

```
SPEC.md                          # Language spec (authoritative)
examples/                        # Runnable workflow examples (flat, no subdirs)
runtime/                         # TypeScript reference implementation (npm package)
  src/
    types/index.ts               # All types
    parser/                      # parseSkillMd, parseWorkflowYaml, schema.ts (Zod)
    expression/                  # Expression language: resolve, template, lex/parse/eval
    validator/                   # validateWorkflow — DAG, type, tool checks
    executor/                    # dispatch + 4 step executors
    runtime/                     # runWorkflow — execution loop, run log
    adapters/                    # MockToolAdapter (only adapter; no LLM adapter)
    config/                      # loadConfig — env vars
    index.ts                     # Public API (all re-exports live here)
  test/
    unit/                        # One file per module
    integration/                 # End-to-end + graduation tests
  skill/SKILL.md                 # Copy of .claude/skills/workflow-author/SKILL.md
.claude/
  skills/workflow-author/SKILL.md  # Workflow-author skill (source)
  rules/                           # Auto-loaded coding rules
```

## Development

All commands run from `runtime/`:

```sh
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run lint        # eslint src/ test/
npm run build       # tsdown — produces dist/
```

Pre-publish gate: `npm run prepublishOnly` runs typecheck + test + lint + build in sequence.

## Architecture

- **Library-only** — no CLI, no built-in tools. Consumers provide a `ToolAdapter` for all external calls (LLM, HTTP, etc.).
- **4 step types:** `tool`, `transform`, `conditional`, `exit`
- **9-step execution lifecycle** per step (see SPEC.md § Runtime > Execution Model)
- **`ToolAdapter` interface** is the only runtime boundary; adapters live in `src/adapters/`

## Key Conventions

| Convention | Rule |
| --- | --- |
| Step output field | `value` |
| Mapping from executor result | `$result` (not `$output`) |
| Workflow input fallbacks | `default` field (not `value`) |
| ESM imports | `.js` extension on all local imports |
| `noUncheckedIndexedAccess` | Guard array access; use `!` after bounds check |

## SKILL.md Sync

`.claude/skills/workflow-author/SKILL.md` and `runtime/skill/SKILL.md` must be **identical**.
After editing either copy, update the other. SKILL.md must be **platform-agnostic** — no repo paths, `npm run` commands, or dev-only instructions.

## Public API

Everything consumed by library users is re-exported from `runtime/src/index.ts`. See `.claude/rules/public-api.md` for the current export list. Update `index.ts` whenever a public symbol is added or removed.
