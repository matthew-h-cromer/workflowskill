# WorkflowSkill

A standard for authoring durable Python workflows from natural language descriptions, plus a CLI for developing and testing them.

## Purpose

**The standard** — `skill/SKILL.md` is the main artifact: a platform-agnostic authoring guide published via npm. Other ecosystems implement their own WorkflowSkill runtimes independently; this repo does not provide one.

**The CLI** serves two purposes:
1. **Improve the skill** — An eval-driven test framework (in `evals/`) measures how well `skill/SKILL.md` teaches an LLM to generate valid workflows. Run evals before and after editing the skill.
2. **Execute workflows locally** — Developers can run workflows on their machine during development.

## Repo Structure

```
skill/
  SKILL.md                         # Workflow-author skill (the main artifact)
evals/                             # Eval framework for improving skill/SKILL.md
  ast_checks.py                    # AST assertion helpers
  conftest.py                      # Fixtures: LLM caller, skill parser, score report
  test_authoring.py                # Eval test cases
  snapshots/                       # Saved generated outputs for diffing
examples/                          # Runnable workflow examples (SKILL.md format)
workflows/                         # Local workflow workspace (gitignored)
cli/
  workflowskill/                   # Python package
    __init__.py
    main.py                        # Click CLI: run, worker commands
    display.py                     # Rich console output
    config.py                      # Temporal connection config (env vars)
    actions/
      registry.py                  # ActionRegistry — register tools as Temporal activities
      exec.py                      # exec action (shared across toolpacks)
    loader/
      skill_loader.py              # Parse SKILL.md → LoadedSkill
      validator.py                 # AST validator for restricted Python subset
    runner/
      runner.py                    # run_skill() — load → start Temporal → execute → return
    toolpacks/                       # Pluggable action providers
      builtin/                     # Built-in actions (api, scrape, llm)
      openclaw/                    # OpenClaw platform actions
  tests/                           # CLI unit & integration tests
    unit/
    integration/
pyproject.toml                     # Python project config (uv, dependencies)
```

## Development

```sh
uv sync --extra dev          # Install dependencies
uv run pytest cli/tests      # Run CLI tests
uv run mypy cli/workflowskill/   # Type checking
uv run ruff check cli/workflowskill/  # Linting
uv run ruff format cli/workflowskill/ # Formatting

# Run CLI directly:
uv run python -m workflowskill.main run <file>

# Install CLI globally:
uv tool install .
workflowskill run examples/hello-world.md
```

## Eval Suite

The eval suite measures how well `skill/SKILL.md` teaches an LLM to generate valid workflows. Evals call Claude and cost money, so they run only on demand.

### Running evals

```sh
uv run pytest -m eval -v                     # Run all evals
uv run pytest -m eval -k test_loop -v        # Run one eval
EVAL_RETRIES=5 uv run pytest -m eval -v      # Multi-trial stability check
uv run pytest -m eval --eval-snapshot -v     # Save generated outputs for diffing
```

Requires `ANTHROPIC_API_KEY` in the environment. Tests are skipped automatically if the key is not set.

### What evals test

Each eval gives Claude a natural-language task and checks whether the generated SKILL.md has the correct structure via AST analysis. Tests target specific language features: pure logic, single/sequential/parallel activities, conditionals, loops, retry policies, error recovery, explicit timeouts, and LLM schema usage.

## Improving the Skill

When making changes to `skill/SKILL.md`, follow this eval-driven workflow:

### Step 1: Baseline

Run evals and note which tests pass:

```sh
uv run pytest -m eval -v
```

This tells you the current state so you can distinguish regressions you introduced from pre-existing failures.

### Step 2: Make the change

Edit `skill/SKILL.md`. This is the authoring guide that teaches the model how to generate workflows — changes here affect generation quality.

### Step 3: Run evals and save snapshots

```sh
uv run pytest -m eval --eval-snapshot -v
```

When an eval fails, the assertion message includes the full generated code. Read it to understand what the model got wrong, then go back to Step 2 and adjust SKILL.md accordingly. Repeat until no new regressions — all tests that passed at baseline still pass.

**Always run with `--eval-snapshot`.** Snapshots in `evals/snapshots/` are the record of what the model actually generated. They must be kept current with every SKILL.md change so regressions are visible as diffs, not just test failures.

### Adding a new eval

If your change introduces a new pattern that existing evals don't cover:

1. Add an AST check to `evals/ast_checks.py` if needed (follow existing patterns)
2. Add a test to `evals/test_authoring.py` with a natural-language task and structural assertions
3. Run it **before** editing SKILL.md to see if the model already handles it
4. If it fails, edit SKILL.md and iterate per Steps 2–3
5. **Save snapshots** once the test passes: `uv run pytest -m eval -k <test_name> --eval-snapshot -v`

### Eval design principles

Each eval tests whether SKILL.md successfully teaches one structural pattern. Follow these principles:

- **One pattern per test.** Isolate the feature you're testing. A test for retry policies shouldn't also require parallel execution.
- **Task reads like a user request.** The TASK string is what a real user would say. Describe the goal, not the implementation — say "run in parallel" not "use asyncio.gather".
- **Assert structure via AST, not string matching.** The model may generate valid code that looks different from what you expect. Use `evals/ast_checks.py` helpers to check structural properties.
- **Assert absence too.** The strongest evals check both what SHOULD be there and what should NOT. For example, a deterministic extraction test asserts `scrape` is present AND `llm` is absent. This catches the model over-reaching.
- **Include generated code in assertion messages.** Every assertion should embed the generated code in its failure message so the developer can immediately see what the model produced without re-running.
- **Keep assertions minimal.** Only assert what's structurally necessary for the pattern. Don't assert variable names, string formatting, or style choices.

## Key Conventions

| Convention | Rule |
|-----------|------|
| Workflow return type | Always `dict` |
| Action handler signature | `async def handler(args: dict) -> dict` |
| Action invocation | `workflow.execute_activity("name", args_dict, start_to_close_timeout=...)` |
| Input passing | Flat keyword args dict to `@workflow.run` |
| Timeout | Default is 30s; override with `start_to_close_timeout` only when needed |
| I/O dataclasses | Optional inside action handlers; workflow interface uses plain `dict` |
| Determinism | Prefer pure Python for parsing, transforming, and filtering. Use `llm` only for genuine inference (summarization, classification, generation, translation). |

## SKILL.md Format

Workflows are Python code blocks in markdown files with YAML frontmatter. See `skill/SKILL.md` for the full format specification.

WorkflowSkills are designed to live alongside regular skills in agent environments and be picked up by progressive discovery. Every SKILL.md includes `type: workflow` in frontmatter (machine-readable discriminator) and a `## Usage` section in the markdown body that says "Run this workflow using the run_workflow tool". Together these ensure a discovering agent knows to execute the workflow via a tool rather than follow it as instructions.

## Skill Authoring Guide

There are two skill files with distinct roles:

- **`skill/SKILL.md`** — Platform-agnostic authoring guide. Used as the system prompt by all consumers. Must never contain platform-specific details. All authoring behavior changes go here.
- **`.claude/skills/workflow-author/SKILL.md`** — The WorkflowSkill CLI's consumer integration. Registers the CLI's built-in actions (`api`, `scrape`, `llm`, etc.) so workflows can be authored and tested locally. This is the reference example that all other consumers should follow — it demonstrates the action registration and skill integration pattern.
