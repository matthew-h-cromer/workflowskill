---
name: commit-conventions
description: >
  Commit and push changes in workflowskill. Use when creating commits, amending,
  proposing a version bump, or reviewing commit messages for this package.
---

# Commit Message Conventions

## Format

```
type(scope): subject

body (optional)

trailers (optional)
```

Scope is optional. When included, it must be one of the project scopes listed below.

## Allowed Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only (README, CLAUDE.md, RFC, inline docs) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests only |
| `chore` | Tooling, config, dependencies, CI — no production code |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `build` | Build system or external dependency changes |

## Subject Line Rules

- Imperative mood ("add", not "added" or "adds")
- Lowercase after the colon (`feat: add ...`, not `feat: Add ...`)
- No trailing period
- Max 72 characters total
- Summarize *what* changed, not *how*

## Body Rules

- Separate from subject with a blank line
- Explain *why* the change was made, not *what* changed
- Wrap at 72 characters
- Optional for small, self-explanatory changes

## Trailers

Co-authored commits include:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Project Scopes

| Scope | Covers |
|-------|--------|
| `loader` | SKILL.md parsing, frontmatter extraction, AST validation |
| `runner` | run_skill orchestration |
| `cli` | CLI commands |
| `toolkits` | Platform toolkit implementations (weldable, etc.) |
| `runtimes` | Workflow execution environments (dbos, etc.) |
| `examples` | Example workflow files |

## Version bump evaluation

Before every commit, evaluate whether `package.json` version should change. Walk through the reasoning out loud, then propose a bump (or none) and wait for user confirmation before running `git commit`.

### Decision process

1. **Identify what's in the published surface.** Only changes to files shipped via `package.json` `files`/`exports` (here: `dist/schema/**`, `skill/**`) affect consumers. Changes to `evals/`, `conformance/`, `test/`, `CLAUDE.md`, `.gitignore`, CI config, and scripts do **not**.

2. **Classify the published change** against semver:
   - **major** (`x.0.0`) — breaking change to public API, schema, or skill content that existing consumers must adapt to. For 0.x, still use major for intentional breaks.
   - **minor** (`0.x.0`) — new public API, new schema field, new skill guidance, new exported helper. Backwards-compatible additions.
   - **patch** (`0.0.x`) — bug fix, internal refactor, doc-only changes inside published files, robustness improvements that don't add API surface.
   - **none** — nothing in the published surface changed. Internal-only tooling, dev docs, tests, CI.

3. **Default to patch when in doubt** between patch and minor. Minor should signal "there's something new you can use."

### Output format (always show the user)

```
Version bump: <current> → <proposed>    (or: no bump)

Reasoning:
- <what shipped: specific file(s) in published surface>
- <what didn't ship: internal-only changes>
- <which semver bucket this falls in and why>
```

Then ask: "Proceed with commit?" Wait for approval before running `git commit`. Never bump version and commit in one silent step.

### Examples

- Fix inside `src/loader/parse.ts` + new evals + CLAUDE.md edits → **patch**. Only the loader fix ships; the rest is internal.
- Add a new exported helper from `src/schema/index.ts` → **minor**. New API surface.
- Rename a field in `WorkflowSchema` → **major**. Breaking for anyone parsing workflows.
- Edit `evals/`, `.gitignore`, and `CLAUDE.md` only → **no bump**. Nothing ships.
- Rewrite `skill/SKILL.md` guidance → **minor** (authoring behavior changed for consumers reading the skill). If it's a pure typo fix, patch.

## Examples

Good:

```
feat(loader): add frontmatter validation for input types
```

```
docs(spec): add expression language specification
```

```
fix(runner): prevent duplicate activity execution on retry
```

```
chore: scaffold TypeScript project with pnpm and vitest
```

Bad (and how to fix):

```
# Bad: no type prefix, past tense
Added api action
# Good:
feat(toolkits): add weldable toolkit

# Bad: uppercase after colon, trailing period
feat: Add new loader module.
# Good:
feat(loader): add new loader module

# Bad: too vague
fix: stuff
# Good:
fix(runner): handle null return from activity handler
```
