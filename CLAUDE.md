# WorkflowSkill

Declarative workflow language + TypeScript runtime for orchestrating tool-calling agents.

## Spec

`SPEC.md` is the authoritative source of truth. Read the relevant section before modifying any runtime module.

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
  skill/SKILL.md                 # Workflow-author skill (single source of truth)
cli/                             # CLI package (workflowskill command)
  src/
    cli.ts                       # Entry point: arg parsing, file loading, run
    display.ts                   # Colored onEvent handler (picocolors)
    adapter.ts                   # CliToolAdapter: web_fetch + llm
    tools/
      web-fetch.ts               # web_fetch tool
      llm.ts                     # llm tool (Anthropic SDK)
  test/
    unit/                        # Unit tests for each module
    integration/                 # Runs hello-world.md via child process
.claude/
  skills/workflow-author/SKILL.md  # Pointer to runtime/skill/SKILL.md + local context
  rules/                           # Auto-loaded coding rules
```

## Development

Runtime library (`runtime/`):

```sh
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run lint        # eslint src/ test/
npm run build       # tsdown — produces dist/
```

Pre-publish gate: `npm run prepublishOnly` runs typecheck + test + lint + build in sequence.

CLI (`cli/`):

```sh
npm install         # installs deps and symlinks runtime via file:../runtime
npm run build       # tsdown — produces dist/cli.mjs
npm run typecheck   # tsc --noEmit
npm run test        # vitest run (unit + integration)
npm run lint        # eslint src/ test/
npm link            # makes `workflowskill` available globally

# Dev without building:
npx tsx src/cli.ts run <file>
```

## CLI Usage

```sh
workflowskill run <file>                          # run a workflow file
workflowskill run <file> -i key=value             # pass an input (repeatable)
workflowskill run <file> --json-input '{...}'     # pass all inputs as JSON
workflowskill run <file> --output-json            # print full RunLog as JSON
```

Built-in tools provided by the CLI:

| Tool | Description | Required env |
| --- | --- | --- |
| `web_fetch` | Fetch a URL, return markdown or plain text | — |
| `llm` | Call Claude, return a parsed JSON object | `ANTHROPIC_API_KEY` |

## Architecture

- **Library + CLI** — `runtime/` is a pure orchestration library; `cli/` wraps it with `web_fetch` and `llm` tools for command-line use.
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

## SKILL.md

`runtime/skill/SKILL.md` is the single source of truth for the workflow-author skill. Edit it directly. `.claude/skills/workflow-author/SKILL.md` is a thin pointer that references the canonical file and adds local Claude Code context (available tools, dev workflow). Do not duplicate authoring content into the pointer file.

## Public API

Everything consumed by library users is re-exported from `runtime/src/index.ts`. Update `index.ts` whenever a public symbol is added or removed.
