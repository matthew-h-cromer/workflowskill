---
name: commit-conventions
description: >
  Commit message conventions for this project. Use when creating git
  commits, amending commits, or reviewing commit messages.
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
| `loader` | SKILL.md parsing, frontmatter extraction |
| `actions` | ActionRegistry, action handlers |
| `runner` | run_skill orchestration, Temporal lifecycle |
| `cli` | Click CLI commands (run, worker) |
| `builtin` | Built-in CLI actions (api, web_scrape, llm, etc.) |
| `spec` | SPEC.md specification |
| `examples` | Example workflow files |

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
chore: scaffold Python project with uv and pytest
```

Bad (and how to fix):

```
# Bad: no type prefix, past tense
Added api action
# Good:
feat(builtin): add api action

# Bad: uppercase after colon, trailing period
feat: Add new loader module.
# Good:
feat(loader): add new loader module

# Bad: too vague
fix: stuff
# Good:
fix(runner): handle null return from activity handler
```
