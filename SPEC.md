# WorkflowSkill Specification

> **Related documents:** [Proposal](PROPOSAL.md) | [Examples](examples/)

## Contents

- [Quick Example](#quick-example)
- [SKILL.md Format](#skillmd-format)
  - [Frontmatter](#frontmatter)
  - [Python Code Block](#python-code-block)
- [Workflow Definition](#workflow-definition)
- [Actions](#actions)
  - [Action Registration](#action-registration)
  - [Calling Actions from Workflows](#calling-actions-from-workflows)
  - [Action I/O Typing](#action-io-typing)
- [Input/Output Typing](#inputoutput-typing)
- [Skill Loading](#skill-loading)
- [Runner](#runner)
- [CLI](#cli)

## Quick Example

A minimal hello-world workflow in SKILL.md format:

```
---
type: workflow
name: hello-world
description: Returns a greeting. No external services required.
---

# Hello World

## Usage

Run this workflow using the run_workflow tool

## Workflow

\```python
return {"message": "Hello, world!"}
\```
```

A workflow that calls an action:

```
---
type: workflow
name: check-status
description: Calls a URL and returns the HTTP status code.
inputs:
  url:
    type: str
    default: "https://example.com"
---

# Check Status

## Usage

Run this workflow using the run_workflow tool

## Workflow

\```python
result = await workflow.execute_activity(
    "api",
    {"url": url},
)
return {"status": result["status"], "content": result["content"]}
\```
```

## SKILL.md Format

A SKILL.md file is a markdown document with YAML frontmatter and a fenced `python` code block containing **the body of the workflow's run method** — just the logic, nothing else.

The loader auto-injects all imports and wraps the code in the workflow class. Authors write only what the method does.

### Frontmatter

The frontmatter block appears at the top of the file between `---` delimiters.

```yaml
---
type: workflow             # Required. Always "workflow". Identifies this as an executable workflow.
name: my-workflow          # Required. Identifier for the workflow.
description: What it does  # Required. Human-readable description.
inputs:                    # Optional. Workflow inputs with types and defaults.
  query:
    type: str
    default: "default value"
  count:
    type: int
    default: 10
outputs:                   # Optional. Declared workflow outputs.
  result:
    type: str
    description: The result value
---
```

**`type: workflow`** is required and must always be the literal string `"workflow"`. It serves as a machine-readable discriminator so agents and tooling can identify SKILL.md files as executable workflows — not instructions to follow manually — without parsing the full document.

**Supported input types:** `str`, `int`, `float`, `bool`, `list`, `dict`

All inputs are optional — they may be overridden at runtime via CLI flags or programmatic invocation. If not provided, the `default` value is used.

**`outputs`** is optional. When declared, the runner validates that every declared key is present in the returned dict. Each entry has:
- `type` — the expected type (informational only; not enforced at runtime)
- `description` — human-readable description (optional)

### Usage and Workflow Sections

Every SKILL.md file includes two standard sections in the markdown body, after the document heading:

**`## Usage`** — tells any discovering agent that this is an executable workflow and must be run via a tool, not followed as instructions:

```markdown
## Usage

Run this workflow using the run_workflow tool
```

This is always exactly one line. It is documentation only — the loader ignores it.

**`## Workflow`** — contains the fenced `python` code block, optionally preceded by a brief description:

```markdown
## Workflow

\```python
return {"message": "Hello, world!"}
\```
```

**Rules:**
- `## Usage` always contains exactly: "Run this workflow using the run_workflow tool"
- `## Workflow` contains the code block (the loader finds the first `python` code block anywhere in the file)
- These sections appear in order: heading → Usage → Workflow

### Python Code Block

The code block contains **only the method body** — no imports, no class, no decorators:

````markdown
```python
result = await workflow.execute_activity(
    "api",
    {"url": url},
)
return {"status": result["status"], "content": result["content"]}
```
````

The loader generates the full module automatically:

```python
# Auto-injected by the loader:
from temporalio import workflow as _tw
from temporalio.common import RetryPolicy
from datetime import timedelta
import asyncio

# Proxy that defaults start_to_close_timeout=timedelta(seconds=30):
workflow = _WorkflowProxy()

# Auto-generated from frontmatter name and inputs:
@workflow.defn
class FetchPageWorkflow:
    @workflow.run
    async def run(self, url: str = "https://example.com") -> dict:
        # ← user code goes here
        result = await workflow.execute_activity(...)
        return {"status": result["status"], "content": result["content"]}
```

**What is available in user code:**
- `workflow` — proxy object; use `workflow.execute_activity(...)` to call actions
- `RetryPolicy` — for retry policies on activity calls
- `timedelta` — for explicit timeouts
- `asyncio` — for `asyncio.gather(...)` and other async utilities
- All built-in Python types and functions (see restrictions below)

**Default timeout:** `workflow.execute_activity()` defaults to `start_to_close_timeout=timedelta(seconds=30)`. Pass an explicit `start_to_close_timeout` to override.

**Class name:** Derived from frontmatter `name` by capitalizing each hyphen/underscore-separated word and appending `Workflow`. Example: `fetch-page` → `FetchPageWorkflow`.

**Method signature:** Derived from frontmatter `inputs`. Each input becomes a typed parameter with its default value.

Rules:
- The code block must **not** contain imports — they are auto-injected.
- The code block must **not** contain class definitions.
- Input names used in the code must match the keys declared in frontmatter `inputs`.
- The code must return a `dict` (via `return`).

**Restricted Python:** The code block is validated against a restricted subset of Python at load time. Only method-body constructs are allowed.

**Blocked patterns:**
- `import os`, `import sys`, `import subprocess`, or any import statement (all auto-injected)
- Class definitions (`class Foo: ...`)
- `eval()`, `exec()`, `compile()`, `open()`, `__import__()`, `getattr()`, `setattr()`, `delattr()`, `globals()`, `locals()`, `vars()`, `breakpoint()`
- Dunder attribute access (`__class__`, `__subclasses__`, `__builtins__`, etc.)
- `with` / `async with` statements
- `global` / `nonlocal` statements
- `lambda` expressions

These restrictions keep workflows simple and safe. All external operations must go through registered actions via `workflow.execute_activity()`.

## Workflow Definition

Workflow method-body code uses these patterns:

```python
# Single activity call (default 30s timeout)
result = await workflow.execute_activity(
    "action_name",
    {"key": "value"},
)
return {"output": result["field"]}
```

**Key conventions:**

| Convention | Rule |
|-----------|------|
| Return type | Always `dict` |
| Action invocation | `workflow.execute_activity("name", args_dict, ...)` |
| Action args | Pass as a `dict` (not a dataclass) |
| Default timeout | 30 seconds (auto-applied; override with `start_to_close_timeout`) |

**Explicit timeout:**

```python
result = await workflow.execute_activity(
    "my_action",
    {"url": url},
    start_to_close_timeout=timedelta(seconds=60),
)
```

**Parallel execution:**

```python
a, b = await asyncio.gather(
    workflow.execute_activity("action_a", {...}),
    workflow.execute_activity("action_b", {...}),
)
```

**Retry policy:**

```python
result = await workflow.execute_activity(
    "my_action",
    {"url": url},
    retry_policy=RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=2)),
)
```

## Actions

Actions are WorkflowSkill's abstraction for platform-provided tools. The core knows nothing about `api`, `llm`, or any specific capability. Actions are registered via the `ActionRegistry`.

When a workflow calls `workflow.execute_activity("api", ...)`, Temporal routes that to the registered `api` action. The action runs as a Temporal activity with full durability, retry, and timeout semantics.

### Action Registration

```python
from workflowskill.actions.registry import ActionRegistry

registry = ActionRegistry()

# Register a handler function as an action
registry.register(
    name="my_action",
    handler=my_handler_function,
)
```

The handler must be an `async` function (or a sync function — the registry wraps it). It receives a `dict` of inputs and returns a `dict` of outputs:

```python
async def my_handler(args: dict) -> dict:
    url = args["url"]
    # ... do work ...
    return {"content": result}
```

### Calling Actions from Workflows

In the workflow code block, call registered actions via `workflow.execute_activity()`:

```python
result = await workflow.execute_activity(
    "my_action",
    {"key": "value"},
)
# result is the dict returned by the handler
content = result["content"]
```

The activity name must match the name used in `registry.register()`.

### Action I/O Typing

Action handlers receive a `dict` and return a `dict`. This keeps the interface simple and compatible with any caller. For internal clarity, handlers may use dataclasses:

```python
from dataclasses import dataclass

@dataclass
class ApiInput:
    url: str
    method: str = "GET"

@dataclass
class ApiOutput:
    content: str
    url: str
    content_type: str
    status: int

async def api_handler(args: dict) -> dict:
    inp = ApiInput(**args)
    # ... fetch ...
    out = ApiOutput(content=content, url=inp.url, content_type=ct, status=status)
    return out.__dict__
```

## Input/Output Typing

Workflow inputs are declared in frontmatter and passed as keyword arguments to the generated `@workflow.run` method. Outputs are returned as a `dict`.

**Input declaration in frontmatter:**

```yaml
inputs:
  query:
    type: str
    default: "hello"
  count:
    type: int
    default: 5
```

**Generated method signature:**

```python
async def run(self, query: str = "hello", count: int = 5) -> dict:
```

The loader passes inputs as a flat dict of keyword arguments. Defaults in frontmatter are used when inputs are not provided at runtime.

**Output:** The return value is the workflow result. It must be a `dict`. The keys become the workflow's named outputs. When `outputs` is declared in frontmatter, the runner validates that all declared keys are present in the returned dict.

## Skill Loading

The skill loader parses a SKILL.md file and returns a `LoadedSkill` ready for execution.

**Loading process:**

1. Read the markdown file.
2. Extract YAML frontmatter (between `---` delimiters).
3. Extract the first fenced `python` code block (method-body code).
4. Validate the code against the restricted Python subset.
5. Generate a complete Python module: preamble (imports + `_WorkflowProxy`) + workflow class wrapping the user code.
6. Write the generated module to a temporary `.py` file and import it.
7. Find the class decorated with `@workflow.defn`.
8. Return a `LoadedSkill` with the workflow class, input metadata, and name.

**`LoadedSkill` fields:**

```python
@dataclass
class LoadedSkill:
    name: str
    description: str
    workflow_class: type
    inputs: dict[str, InputSpec]   # name → {type, default}
    outputs: dict[str, OutputSpec]  # name → {type, description}
    type: str                       # always "workflow"
```

**Error conditions:**

- No `python` code block found → `SkillLoadError`
- Import statement in code block → `SkillLoadError`
- Class definition in code block → `SkillLoadError`
- Blocked callable (`eval`, `exec`, etc.) → `SkillLoadError`
- Syntax error in the code block → `SkillLoadError` (wraps the `SyntaxError`)

## Runner

The runner provides a high-level function for executing a SKILL.md workflow end-to-end.

```python
from workflowskill.actions.registry import ActionRegistry
from workflowskill.runner.runner import run_skill

registry = ActionRegistry()
registry.register("api", api_handler)

result = await run_skill(
    skill_path="examples/hello-world.md",
    inputs={"query": "temporal"},
    registry=registry,
)
# result is the dict returned by the workflow
```

**Execution steps:**

1. Load the SKILL.md via the skill loader.
2. Merge provided inputs with frontmatter defaults.
3. Start an embedded Temporal environment via `WorkflowEnvironment.start_local()`.
4. Register the workflow class and all actions from the registry as worker activities.
5. Start the worker.
6. Execute the workflow with the merged inputs.
7. Shut down the worker and Temporal environment.
8. Return the workflow result dict.

The embedded Temporal environment (`start_local()`) requires no external Temporal server — it runs in-process. This is the default mode for the CLI and single-workflow execution.

For long-running worker mode (connecting to an external Temporal server), see the CLI documentation below.

## CLI

The CLI is a consumer of the `workflowskill` library. It registers built-in actions and calls `run_skill`.

**Usage:**

```sh
workflowskill run <file>                     # Run a workflow file
workflowskill run <file> -i key=value        # Pass an input (repeatable)
workflowskill run <file> --json-input '{...}' # Pass all inputs as JSON
workflowskill worker                         # Long-running worker mode
```

**Built-in actions (provided by the CLI, not the library):**

| Action | Description | Required env |
|--------|-------------|-------------|
| `api` | Make an HTTP request, return raw response body | — |
| `scrape` | Fetch a page and extract data via CSS selectors (text, attributes, or HTML) | — |
| `llm` | Call Claude, return a parsed JSON object | `ANTHROPIC_API_KEY` |

**Examples:**

```sh
# Run the hello-world example
workflowskill run examples/hello-world.md

# Run with inputs
workflowskill run examples/llm-haiku.md -i subject="autumn leaves"

# Run with JSON inputs
workflowskill run examples/summarize-hacker-news.md
```

## Authoring Skill Integration

`skill/SKILL.md` is a workflow authoring guide intended to be loaded as a Claude skill.
When Claude generates or updates a workflow, it calls the `save_workflow` tool to deliver
the result. **Consumers who integrate this skill must provide a `save_workflow` tool
implementation.**

### Tool contract

- **Tool name:** `save_workflow`
- **Parameter:** `markdown` (string) — the complete SKILL.md file content (frontmatter + body + code block)
- **Behavior:** Saves or updates the workflow file. Each integration implements this tool in its platform's native format (e.g. a Claude Code tool, an MCP tool, a function tool in an API call).

This is an output-only tool — Claude calls it to deliver the generated workflow. The
tool should persist the file and may return a confirmation message.

### Example: Claude Code integration

In Claude Code, `save_workflow` is registered as a slash-command tool that writes the
markdown to a file in the `examples/` directory.

### Why a tool instead of a text response

Having Claude call a tool (rather than writing the file content in its reply) keeps the
workflow content separate from the conversational response. The consumer controls where
and how the file is saved, and the authoring conversation remains clean.

## Eval-Driven Skill Iteration

The authoring guide (`skill/SKILL.md`) is treated as a tool description for an agent.
Following Anthropic's guidance on building tools for agents, we refine this guide based
on systematic evaluation rather than intuition.

### How it works

The eval suite in `tests/evals/` measures authoring skill performance:
- Each test provides a task description and checks whether the generated workflow
  matches the expected structure
- Tests target specific spec features (loops, error recovery, output threading, etc.)
  so regressions are caught per-feature
- Results identify which sections of the authoring guide need improvement

### Growth model

The eval suite grows alongside the spec:
- **New language feature** → add a corresponding eval that tests whether the authoring
  guide teaches the LLM to use it correctly
- **New action** → add an eval that tests whether the LLM correctly references the
  action's input/output contract
- **Bug report** (LLM generates invalid workflow) → add a regression eval that
  reproduces the failure, then fix the authoring guide until it passes
- **Spec change** → update affected evals to match new expected structure

### Reviewing results

When an eval fails, the assertion message includes the full generated code. Review
the raw output to understand what the LLM produced vs. what was expected. This is
the "reviewing raw tool call transcripts" practice — the generated SKILL.md is
effectively the agent's tool output, and structural analysis reveals where the
authoring guide's instructions were unclear or missing.
