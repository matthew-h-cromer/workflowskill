# WorkflowSkill

Temporal-based workflow engine where agents author Python workflows from natural language descriptions.

## Spec

`SPEC.md` is the authoritative source of truth. Read the relevant section before modifying any module.

## Architecture

**Library + CLI** — `workflowskill` is a pure orchestration library; the CLI wraps it with built-in actions (`api`, `scrape`, `llm`, etc.) for command-line use. An OpenClaw plugin or other consumer would import `workflowskill` and register its own actions instead.

**Tool-agnostic runtime** — The `workflowskill` library knows nothing about specific tools. Consumers register tools as Temporal activities via the `ActionRegistry`. This keeps the library modular and reusable across platforms.

**Temporal foundation** — Durable execution, retry policies, scheduling, and state persistence are provided by Temporal. We do not implement these ourselves.

## Repo Structure

```
SPEC.md                          # Language spec (authoritative)
PROPOSAL.md                      # Design rationale and problem statement
examples/                        # Runnable workflow examples (SKILL.md format)
src/
  workflowskill/
    __init__.py                  # Public API: ActionRegistry, run_skill, LoadedSkill
    config.py                    # Temporal connection config (env vars)
    actions/
      __init__.py
      registry.py                # ActionRegistry — register tools as Temporal activities
    loader/
      __init__.py
      skill_loader.py            # Parse SKILL.md → LoadedSkill
      validator.py               # AST validator for restricted Python subset
    runner/
      __init__.py
      runner.py                  # run_skill() — load → start Temporal → execute → return
    cli/
      __init__.py
      main.py                    # Click CLI: run, worker commands
      display.py                 # Rich console output
      builtin_actions/           # Built-in actions provided by CLI (not by library)
        __init__.py
        types.py                 # I/O dataclasses for built-in actions
        api.py                   # api action (raw HTTP requests)
        scrape.py            # scrape action
        llm.py                   # llm action (Anthropic SDK)
pyproject.toml                   # Python project config (uv, dependencies)
skill/SKILL.md                   # Workflow-author skill (authoring guide)
```

## Development

```sh
uv sync --extra dev      # Install dependencies
uv run pytest            # Run tests
uv run mypy src/         # Type checking
uv run ruff check src/   # Linting
uv run ruff format src/  # Formatting

# Dev without installing:
uv run python -m workflowskill.cli.main run <file>

# Install CLI globally:
uv tool install .
workflowskill run examples/hello-world.md
```

## Eval Suite

The project includes an eval-driven test suite that measures how well `skill/SKILL.md`
teaches an LLM to generate valid workflows. Evals are separate from unit/integration
tests — they call Claude and cost money, so they run only on demand.

### Running evals

```sh
uv run pytest -m eval -v                    # Run all evals
uv run pytest -m eval -k test_loop -v       # Run one eval
EVAL_RETRIES=5 uv run pytest -m eval -v     # Multi-trial stability check
uv run pytest -m eval --eval-snapshot -v     # Save generated outputs for diffing
```

Requires `ANTHROPIC_API_KEY` in the environment. Tests are skipped automatically
if the key is not set.

### What evals test

Each eval gives Claude a natural-language task and checks whether the generated
SKILL.md has the correct structure via AST analysis. Tests target specific language
features: pure logic, single/sequential/parallel activities, conditionals, loops,
retry policies, error recovery, explicit timeouts, and LLM schema usage.

### When to run evals

Run evals **before and after** modifying `skill/SKILL.md`. Compare results to confirm
your changes improved (or at least didn't regress) generation quality. Use `--eval-snapshot`
to save outputs and diff them across changes.

### Adding new evals

When adding a new language feature or workflow pattern:
1. Add an AST check function to `tests/evals/ast_checks.py` if needed
2. Add a test case to `tests/evals/test_authoring.py` with a task description and
   structural assertions
3. Run the eval to establish a baseline before updating the authoring guide

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

## Public API

Everything consumed by library users is exported from `src/workflowskill/__init__.py`:

- `ActionRegistry` — register tools as Temporal activities
- `run_skill(skill_path, inputs, registry)` — load and execute a SKILL.md
- `load_skill(skill_path)` — parse a SKILL.md and return a `LoadedSkill`
- `LoadedSkill` — dataclass returned by the skill loader
- `InputSpec` — dataclass describing a single workflow input parameter
- `OutputSpec` — dataclass describing a single workflow output
- `SkillLoadError` — raised when a SKILL.md cannot be loaded

## SKILL.md Format

Workflows are Python code blocks in markdown files with YAML frontmatter. See SPEC.md § SKILL.md Format for the full specification.

## Skill Authoring Guide

There are two skill files with distinct roles:

- **`skill/SKILL.md`** — Platform-agnostic authoring guide. Used as the system prompt by all consumers. Must never contain platform-specific details. All authoring behavior changes go here.
- **`.claude/skills/workflow-author/SKILL.md`** — The WorkflowSkill CLI's consumer integration. Registers the CLI's built-in actions (`api`, `scrape`, `llm`, etc.) so workflows can be authored and tested locally. This is the reference example that all other consumers should follow — it demonstrates the action registration and skill integration pattern.
