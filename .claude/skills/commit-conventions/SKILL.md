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
| `parser` | YAML parsing, Zod schemas, markdown extraction |
| `expression` | Lexer, parser, evaluator for `$`-references |
| `validator` | Pre-execution validation |
| `executor` | Step executors (tool, llm, transform, conditional, exit) |
| `runtime` | Orchestrator, lifecycle, run log |
| `cli` | CLI commands (validate, run) |
| `adapters` | Mock adapters, AnthropicLLMAdapter |
| `dev-tools` | DevToolAdapter, dev tool implementations (http, gmail, sheets) |
| `types` | TypeScript interfaces |
| `rfc` | RFC specification document |

## Examples

Good:

```
feat(parser): add YAML parser with Zod validation and test fixtures
```

```
docs(rfc): add expression language specification
```

```
fix(runtime): prevent duplicate step execution in conditional branches
```

```
chore: scaffold project with TypeScript, Vitest, and ESLint
```

Bad (and how to fix):

```
# Bad: no type prefix, past tense
Added Expression Language section
# Good:
docs(rfc): add expression language specification

# Bad: meaningless "Step N" prefix
Step 1: Project scaffolding
# Good:
chore: scaffold project with TypeScript, Vitest, and ESLint

# Bad: uppercase after colon, trailing period
feat: Add new parser module.
# Good:
feat(parser): add new parser module

# Bad: too vague
fix: stuff
# Good:
fix(executor): handle null output from tool adapter
```
