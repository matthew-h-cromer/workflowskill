---
name: workflowskill-workflow-author
description: >
  Teaches Claude how to generate Python workflows in SKILL.md format
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

### Phase 2: Research & Probe

- **Confirm available actions first.** The actions available in `workflow.execute_activity()` calls are those registered in the current runtime context. All action names depend on what the host registers. Do not assume any specific action exists. Check your context for the exact names available.
- **Stop if the task is not achievable.** If the user's request requires a capability that no available action provides, do not generate a workflow. Instead, tell the user which capability is missing and what kind of action would need to be registered to support it.
- Search official documentation for any APIs or websites involved.
- **Fetch the target URL or API endpoint yourself** to inspect the actual response structure. This is the source of truth. Do not guess field names, CSS selectors, or JSON keys.
- **Test each action you plan to use.** Invoke each action with real arguments and inspect its output. Verify response structures and field names before using them in a workflow.
- **Fail fast.** If a probe returns an error or unexpected structure, stop and surface the problem to the user before writing any workflow code. Do not guess past a failed probe.

### Phase 3: Assemble Step-by-Step

Build the workflow incrementally. Start with the first action, verify it produces what you expect using real data, then add the next step using the observed output. Only assemble the final SKILL.md once all steps are individually verified.

Map the task to workflow building blocks:

- **Data sources** → `workflow.execute_activity()` calls
- **Transformations** → pure Python logic (list comprehensions, string formatting, dict access)
- **Decision points** → `if`/`else` branches
- **Early exits** → `return` with an appropriate status dict
- **Error handling** → `RetryPolicy` for transient failures; `try`/`except` where needed
- **Human input** → `workflow.wait_for_signal()` to pause for a human response (buttons, free-text, or both)

Wire the steps together using result dicts. Keep the workflow as deterministic as
possible — use LLM actions only when genuine inference is required.

**When applying LLM inference to a list, call the LLM once per item — never batch.**
Pass one item at a time inside a loop. Batching multiple items into a single prompt
makes each result non-retryable, allows one item's content to influence another's
output, and degrades reliability at scale. This rule applies to any list-level
inference: classification, summarization, extraction, translation.

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
name: My Workflow
description: "Save time on repetitive tasks by automating this workflow."
actions: [web.fetch, anthropic.llm]
inputs:
  query:
    type: str
    default: "default value"
    description: "What to query for"
outputs:
  result:
    type: str
    description: "The result value"
---

# My Workflow

## Usage

Run this workflow using the run_workflow tool

## Details

What this workflow does and when to use it. Include prerequisites, config files,
input guidance, or limitations — anything the user needs to know beyond the
one-line description. Omit this section for simple workflows.

## Workflow

\```python
result = await workflow.execute_activity(
    "web.fetch",
    {"url": url},
)
return {"result": result["output"]}
\```
```

### Frontmatter Rules

- `type`: always `workflow` (required) — machine-readable discriminator for progressive discovery
- `name`: Title Case display name (required)
- `description`: one sentence written as persuasive advertising copy — describe the benefit to the user, not the implementation (required)
- `actions`: list of action ids used in `execute_activity` calls (required when the workflow calls any actions; omit for pure-logic workflows). Enables compatibility checking during progressive discovery — e.g. `actions: [web.fetch, anthropic.llm]`
- `inputs`: each entry has `type` (str/int/float/bool/list/dict), optional `default`, and optional `description`
- Input names declared in frontmatter become parameters in the generated method signature
- `outputs`: optional; each entry has `type` and optional `description`. When declared, the runner validates that all output keys are present in the returned dict.
- Always quote `description` values with double quotes in YAML to avoid parsing issues with special characters

### Usage and Workflow Section Rules

Every workflow must include two sections after the document heading:

- **`## Usage`** — always contains exactly: "Run this workflow using the run_workflow tool"
- **`## Details`** — *(optional)* plain-language documentation for agents and users. Include this section when the workflow has prerequisites, config files, external dependencies, complex inputs, or non-obvious behavior. Omit it for simple workflows where the frontmatter description is sufficient. Write in plain language — describe what the user needs to know, not implementation details. Cover: what this does and when to use it, prerequisites (API keys, config files, browser sessions, required permissions), input guidance beyond name and type, and known limitations.
- **`## Workflow`** — contains the fenced `python` code block (and optionally a brief description above the code)

### Code Block Rules

- Write **only the method body** — no imports, no class, no decorators
- All inputs declared in frontmatter are available as local variables
- `workflow`, `RetryPolicy`, `timedelta`, `datetime`, `timezone`, `asyncio`, `json`, `re`, `math`, `collections`, and `urllib.parse` are always available
- **`workflow.wait_for_signal(name, *, prompt=None, choices=None, text_input=None, timeout=None)`** — pauses the workflow until a human responds in the UI. `prompt` is the display text shown to the human. `choices` is a list of button labels. `text_input` renders a free-text textarea: pass `True` for no placeholder, or `{"placeholder": "..."}` to set one. `timeout` is in seconds; raises `asyncio.TimeoutError` if the deadline passes. Return value shape depends on parameters — see **Human-in-the-loop** in Workflow Patterns.
- **To get the current time, use `workflow.now()`** — it returns a timezone-aware `datetime` object. Never use `datetime.now()` or `datetime.utcnow()`; those are not available.
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
import asyncio
import json
import re
import math
import collections
import urllib.parse
from datetime import timedelta, datetime, timezone
from dataclasses import dataclass

workflow = _ActionProxy()  # routes execute_activity() calls to registered handlers

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

### Loop over items with LLM (one call per item)

When classifying, summarizing, or extracting from a list, call the LLM **once per item**
inside the loop. Never pass multiple items in a single prompt.

```python
results = []
for email in emails:
    # Triage each email individually
    triage = await workflow.execute_activity(
        "anthropic.llm",
        {
            "prompt": f"Triage this email.\n\nSubject: {email['subject']}\n\n{email['snippet']}",
            "schema": {
                "type": "object",
                "properties": {
                    "urgency": {"type": "string"},
                    "category": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["urgency", "category", "action"],
            },
        },
        start_to_close_timeout=timedelta(seconds=30),
    )
    results.append({
        "id": email["id"],
        "subject": email["subject"],
        "urgency": triage["urgency"],
        "category": triage["category"],
        "action": triage["action"],
    })
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

### Human-in-the-loop (wait_for_signal)

Use `workflow.wait_for_signal()` to pause the workflow until a human responds in
the UI. The workflow suspends durably — it survives worker restarts and resumes
exactly where it left off when the person acts.

**API:**

```python
result = await workflow.wait_for_signal(
    "signal_name",                           # machine-readable identifier (required)
    prompt="Display text",                   # shown to the human (optional)
    choices=["Yes", "No"],                   # button labels (optional, list[str])
    text_input=True,                         # show textarea, no placeholder (optional)
    text_input={"placeholder": "Add..."},    # show textarea with placeholder (optional)
    timeout=3600,                            # max seconds to wait (optional; None = wait forever)
)
```

**Return value** depends on the parameters provided:

| Parameters provided | Return dict |
|---|---|
| `choices` (with or without `text_input`) | `{"choice": "Yes", "text": "typed text or None"}` |
| `text_input` only (no choices) | `{"text": "typed text or None"}` |
| Neither | `{"ok": True}` |

On timeout: `asyncio.TimeoutError` is raised.

**Approval gate:**

```python
# Fetch the content to review
report = await workflow.execute_activity("api", {"url": url})

# Pause for human approval before proceeding
decision = await workflow.wait_for_signal(
    "approval",
    prompt="Review the report and decide whether to publish.",
    choices=["Approve", "Reject"],
)

if decision["choice"] == "Reject":
    return {"status": "rejected"}

# Publish once approved
result = await workflow.execute_activity("api", {"url": publish_url, "method": "POST", "body": report["body"]})
return {"status": "published"}
```

**Collect free-text input:**

```python
# Pause and ask the human for free-text input
feedback = await workflow.wait_for_signal(
    "user_feedback",
    prompt="Please provide your feedback.",
    text_input={"placeholder": "Type your feedback here..."},
)
return {"feedback": feedback["text"]}
```

**Buttons with optional text:**

```python
decision = await workflow.wait_for_signal(
    "review",
    prompt="Does this draft look good?",
    choices=["Approve", "Request Changes"],
    text_input={"placeholder": "Optional: explain your decision..."},
)

if decision["choice"] == "Request Changes":
    return {"status": "changes_requested", "note": decision["text"]}
return {"status": "approved"}
```

**Timeout handling:**

```python
try:
    decision = await workflow.wait_for_signal(
        "approval",
        prompt="Approve this deployment?",
        choices=["Approve", "Reject"],
        timeout=3600,
    )
except asyncio.TimeoutError:
    return {"status": "timed_out", "message": "No response within 1 hour"}

if decision["choice"] == "Approve":
    return {"status": "approved"}
return {"status": "rejected"}
```

**When to use:** approval gates before irreversible actions (deploy, publish, send, delete), collecting human judgment that cannot be automated, gathering free-text input mid-workflow.

**When NOT to use:** anything that can be decided programmatically. If the answer can come from data, an API, or a conditional, use pure Python or `execute_activity` instead.

## Restrictions

Workflow code is validated against a **restricted Python subset** at load time.
Violations cause a `SkillLoadError` before execution begins.

### What is auto-injected (do not write these)

```python
import asyncio
import json
import re
import math
import collections
import urllib.parse
from datetime import timedelta, datetime, timezone
from dataclasses import dataclass

# workflow   — action proxy (execute_activity, wait_for_signal, now)
# RetryPolicy — plain dataclass for retry configuration
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
