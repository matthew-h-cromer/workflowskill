---
name: workflowskill-workflow-author
description: >
  Teaches Claude how to generate Python Temporal workflows in SKILL.md format
  for the WorkflowSkill engine.
---

# WorkflowSkill Workflow Author

You generate valid SKILL.md workflow files for the WorkflowSkill engine. When a user
describes what they want to automate, you produce a `.md` file they can execute.

The user should never have to think about workflow internals. They describe what
they need in natural language; you research, generate, validate, and deliver a
working workflow.

## Authoring Process

### Phase 1: Understand

- Read the user's request carefully.
- If the request is ambiguous, ask 2–3 focused clarifying questions before proceeding.
- If the request is clear, skip directly to Research.

### Phase 2: Research

- **Confirm available actions first.** The actions available in `workflow.execute_activity()` calls are those registered in the current runtime context. All action names depend on what the host registers. Do not assume any specific action exists. Check your context for the exact names available.
- **Stop if the task is not achievable.** If the user's request requires a capability that no available action provides, do not generate a workflow. Instead, tell the user which capability is missing and what kind of action would need to be registered to support it.
- Search official documentation for any APIs or websites involved.
- **Fetch the target URL or API endpoint yourself** to inspect the actual response structure. This is the source of truth. Do not guess field names, CSS selectors, or JSON keys.

### Phase 3: Generate

Map the task to workflow building blocks:

- **Data sources** → `workflow.execute_activity()` calls
- **Transformations** → pure Python logic (list comprehensions, string formatting, dict access)
- **Decision points** → `if`/`else` branches
- **Early exits** → `return` with an appropriate status dict
- **Error handling** → `RetryPolicy` for transient failures; `try`/`except` where needed

Wire the steps together using result dicts. Keep the workflow as deterministic as
possible — use LLM actions only when genuine inference is required.

### Phase 4: Validate & Test

- Run the workflow using the host platform's execution command
- Go beyond the happy path — vary inputs, exercise conditional branches
- Fix any errors and re-run until the workflow reliably accomplishes the original intent

## SKILL.md Format

Every workflow is a markdown file with YAML frontmatter and a fenced `python`
code block. The code block contains **only the method body** — the logic of the
`@workflow.run` method. **Do not write imports, class definitions, or decorators.**
The loader generates all of that automatically.

```
---
type: workflow
name: my-workflow
description: What this workflow does
inputs:
  query:
    type: str
    default: "default value"
outputs:
  result:
    type: str
    description: "The result value"
---

# My Workflow

## Usage

Run this workflow using the run_workflow tool

## Workflow

\```python
result = await workflow.execute_activity(
    "some_action",
    {"query": query},
)
return {"result": result["output"]}
\```
```

### Frontmatter Rules

- `type`: always `workflow` (required) — machine-readable discriminator for progressive discovery
- `name`: kebab-case identifier (required)
- `description`: one sentence (required)
- `inputs`: each entry has `type` (str/int/float/bool/list/dict) and optional `default`
- Input names declared in frontmatter become parameters in the generated method signature
- `outputs`: optional; each entry has `type` and optional `description`. When declared, the runner validates that all output keys are present in the returned dict.
- Always quote `description` values with double quotes in YAML to avoid parsing issues with special characters

### Usage and Workflow Section Rules

Every workflow must include two sections after the document heading:

- **`## Usage`** — always contains exactly: "Run this workflow using the run_workflow tool"
- **`## Workflow`** — contains the fenced `python` code block (and optionally a brief description above the code)

### Code Block Rules

- Write **only the method body** — no imports, no class, no decorators
- All inputs declared in frontmatter are available as local variables
- `workflow`, `RetryPolicy`, `timedelta`, `asyncio`, `json`, `re`, `math`, `collections`, and `urllib.parse` are always available
- **To get the current time, use `workflow.now()`** — it returns a timezone-aware `datetime` object. Never use `datetime.now()` or `datetime.utcnow()`; those are not available and are non-deterministic in Temporal workflows.
- The code must `return` a `dict`
- **Never write `import` statements** — all imports are auto-injected

### Code Style

**Comments describe each step.** Write a short descriptive comment above each `execute_activity` call, loop, conditional, and `asyncio.gather` block. Never prefix with "Step N:". Keep comments under 60 characters.

**Inline string values in `execute_activity` args.** Always pass string values directly in the argument dict. Do not assign to a variable and pass the reference, unless the value is reused in multiple places.

**Triple-quoted f-strings for multi-line strings. Single string literals for long URLs.** Do not use parenthesized implicit string concatenation.

## What the Loader Generates

Given `name: check-status` and `inputs: {url: {type: str, default: "https://example.com"}}`,
the loader wraps your code into:

```python
from temporalio import workflow as _tw
from temporalio.common import RetryPolicy
from datetime import timedelta
import asyncio

workflow = _WorkflowProxy()  # defaults start_to_close_timeout=timedelta(seconds=30)

@workflow.defn
class CheckStatusWorkflow:
    @workflow.run
    async def run(self, url: str = "https://example.com") -> dict:
        # ← your code goes here
```

## Default Timeout

`workflow.execute_activity()` defaults to `start_to_close_timeout=timedelta(seconds=30)`.
You do not need to specify a timeout unless you want a different value.

## Workflow Patterns

> **Note:** Action names in these patterns are illustrative. Always check your context for which actions are actually registered.

### No-activity workflow (pure Python logic)

```python
return {"message": f"Hello, {name}!"}
```

### Single activity call (default 30s timeout)

```python
result = await workflow.execute_activity(
    "fetch_data",
    {"url": url},
)
return {"status": result["status"], "body": result["body"]}
```

### Single activity call with explicit timeout

```python
result = await workflow.execute_activity(
    "run_inference",
    {"prompt": prompt},
    start_to_close_timeout=timedelta(seconds=60),
)
return {"answer": result["answer"]}
```

### Sequential activities (pipeline)

```python
# Fetch raw data
raw = await workflow.execute_activity(
    "fetch_data",
    {"url": url},
)

# Transform with pure Python
items = raw["results"].get("items", [])
content = "\n".join(items)

# Run inference on the result
summary = await workflow.execute_activity(
    "run_inference",
    {
        "prompt": f"Summarize:\n\n{content}",
        "schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": summary["summary"]}
```

### Parallel activities

```python
result_a, result_b = await asyncio.gather(
    workflow.execute_activity("fetch_data", {"url": url_a}),
    workflow.execute_activity("fetch_data", {"url": url_b}),
)
return {"body_a": result_a["body"], "body_b": result_b["body"]}
```

### Get the current time

```python
now = workflow.now()  # timezone-aware datetime (UTC)
today = now.strftime("%Y-%m-%d")
return {"date": today}
```

### Loop over items (sequential)

```python
results = []
for url in urls:
    result = await workflow.execute_activity(
        "fetch_data",
        {"url": url},
    )
    results.append(result)
return {"results": results}
```

### Conditional logic

```python
page = await workflow.execute_activity(
    "fetch_data",
    {"url": url},
)

items = page["results"].get("items", [])
if not items:
    return {"status": "not_found"}

return {"status": "found", "item": items[0]}
```

### Retry policy

```python
result = await workflow.execute_activity(
    "fetch_data",
    {"url": url},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)
return {"body": result["body"]}
```

## Restrictions

Workflow code is validated against a **restricted Python subset** at load time.
Violations cause a `SkillLoadError` before execution begins.

### What is auto-injected (do not write these)

```python
from temporalio import workflow as _tw   # available as `workflow`
from temporalio.common import RetryPolicy
from datetime import timedelta
import asyncio
import json
import re
import math
import collections
import urllib.parse
```

**Never write import statements in the code block.** They will be rejected.

### Blocked operations

- Any `import` or `from ... import` statement
- Class definitions (`class Foo: ...`)
- `eval()`, `exec()`, `compile()`, `open()`, `__import__()`
- `getattr()`, `setattr()`, `delattr()`, `globals()`, `locals()`, `vars()`, `breakpoint()`
- Dunder attribute access: `obj.__class__`, `obj.__subclasses__()`, etc.
- `with` / `async with` statements
- `global` / `nonlocal` statements
- `lambda` expressions

### Design rule

Every external operation must go through a registered action via
`workflow.execute_activity()`. If you need to process data, do it in pure
Python within the workflow. If you need to access a resource (URL, file, API),
it must be a registered action.
