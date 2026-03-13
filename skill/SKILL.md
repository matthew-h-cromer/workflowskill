---
name: workflowskill-workflow-author
description: >
  Teaches Claude how to generate Python Temporal workflows in SKILL.md format
  for the WorkflowSkill workflow engine.
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
- **Stop if the task is not achievable.** If the user's request requires a capability (e.g. sending email, writing to a database) that no available action provides, do not generate a workflow. Instead, tell the user which capability is missing and what kind of action would need to be registered to support it.
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
possible — use `llm` only when genuine inference is required (see **When to Use `llm`**).

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

Brief description of what this workflow does.

\```python
result = await workflow.execute_activity(
    "some_action",
    {"query": query},
)
return {"result": result["output"]}
\```
```

### Frontmatter Rules

- `name`: kebab-case identifier (required)
- `description`: one sentence (required)
- `inputs`: each entry has `type` (str/int/float/bool/list/dict) and optional `default`
- Input names declared in frontmatter become parameters in the generated method signature
- `outputs`: optional; each entry has `type` and optional `description`. When declared, the runner validates that all output keys are present in the returned dict.
- Always quote `description` values with double quotes in YAML to avoid parsing issues with special characters (e.g., `description: "Returns ok if successful, error otherwise"`)

### Code Block Rules

- Write **only the method body** — no imports, no class, no decorators
- All inputs declared in frontmatter are available as local variables
- `workflow`, `RetryPolicy`, `timedelta`, `asyncio`, `json`, `re`, `math`, `collections`, and `urllib.parse` are always available
- **To get the current time, use `workflow.now()`** — it returns a timezone-aware `datetime` object. Never use `datetime.now()` or `datetime.utcnow()`; those are not available and are non-deterministic in Temporal workflows.
- The code must `return` a `dict`
- **Never write `import` statements** — all imports are auto-injected

### Code Style

**Comments describe each step.** Write a short descriptive comment above each `execute_activity` call, loop, conditional, and `asyncio.gather` block. Never prefix with "Step N:". Keep comments under 60 characters.

```python
# Good
# Fetch current weather data

# Bad
# Step 1: Fetch current weather data
```

**Inline string values in `execute_activity` args.** Always pass string values directly in the argument dict. Do not assign to a variable and pass the reference, unless the value is reused in multiple places.

```python
# Good
summary = await workflow.execute_activity("llm", {
    "prompt": f"Summarize: {content}",
})

# Bad
prompt = f"Summarize: {content}"
summary = await workflow.execute_activity("llm", {"prompt": prompt})
```

**Triple-quoted f-strings for multi-line strings. Single string literals for long URLs.** Do not use parenthesized implicit string concatenation.

```python
# Good — single string literal
"url": "https://api.open-meteo.com/v1/forecast?latitude=47.42&longitude=-121.41&daily=snowfall_sum,temperature_2m_max&timezone=America/Los_Angeles"

# Bad — parenthesized concatenation
"url": (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=47.42&longitude=-121.41"
    "&daily=snowfall_sum,temperature_2m_max"
    "&timezone=America/Los_Angeles"
)

# Good — triple-quoted f-string for multi-line prompt
"prompt": f"""Summarize the following article in 2-3 sentences.
Title: {title}

{content}"""

# Bad — parenthesized concatenation
"prompt": (
    f"Summarize the following article in 2-3 sentences. "
    f"Title: {title}\n\n{content}"
)
```

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

> **Note:** The action names used in these patterns (`api`, `scrape`, `llm`) are examples from a common runtime configuration. Always check your context for which actions are actually registered — use only those.

### No-activity workflow (pure Python logic)

```python
return {"message": f"Hello, {name}!"}
```

### Single activity call (default 30s timeout)

```python
result = await workflow.execute_activity(
    "api",
    {"url": url},
)
return {"status": result["status"], "body": result["body"]}
```

### Single activity call with explicit timeout

```python
result = await workflow.execute_activity(
    "llm",
    {"prompt": prompt},
    start_to_close_timeout=timedelta(seconds=60),
)
return {"answer": result["answer"]}
```

### Sequential activities (pipeline)

```python
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"heading": "h1", "body": "article p"}},
)

headings = page["results"].get("heading", [])
body_paragraphs = page["results"].get("body", [])
content = "\n".join(headings + body_paragraphs)

summary = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Summarize this page:\n\n{content}",
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
    workflow.execute_activity("api", {"url": url_a}),
    workflow.execute_activity("api", {"url": url_b}),
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
        "scrape",
        {"url": url, "selectors": {"title": "h1"}},
    )
    results.append(result)
return {"results": results}
```

### Conditional logic

```python
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"price": ".price"}},
)

prices = page["results"].get("price", [])
if not prices:
    return {"status": "no_price_found"}

return {"status": "found", "price": prices[0]}
```

### Retry policy

```python
result = await workflow.execute_activity(
    "api",
    {"url": url},
    retry_policy=RetryPolicy(
        maximum_attempts=3,
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
    ),
)
return {"body": result["body"]}
```

## When to Use `llm`

Workflows should be as deterministic as possible. Use pure Python for parsing,
transforming, filtering, and formatting data. Only use the `llm` action when the
task genuinely requires inference.

**Use `llm` for:** summarization, classification, sentiment analysis, translation,
creative generation, extracting meaning from unstructured text

**Use pure Python for:** counting items, filtering lists, string formatting, math,
restructuring dicts, conditional logic on known fields

**Use `scrape` (not `llm`) for:** extracting specific elements from HTML
(titles, prices, links, headings). CSS selectors are deterministic and free.

### Don't

```python
# BAD: using LLM to extract structured data that scrape handles deterministically
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"raw": "body"}},
)
title = await workflow.execute_activity(
    "llm",
    {"prompt": f"What is the title of this page?\n\n{page['results'].get('raw', [''])[0]}"},
)
```

### Do

```python
# GOOD: scrape for structured extraction, pure Python for transformation
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"title": "title", "headings": "h1"}},
)
titles = page["results"].get("title", [])
return {"title": titles[0] if titles else "Untitled"}
```

### Do (legitimate LLM use)

```python
# GOOD: summarization genuinely requires inference
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"article": "article p"}},
)
content = "\n".join(page["results"].get("article", []))
summary = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Summarize this article in 2-3 sentences:\n\n{content}",
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

## Minimize LLM Input

When a workflow feeds fetched data into `llm`, send only what the LLM needs. Less data
means lower cost, faster responses, and better LLM focus.

**Strategy ladder** (use the highest applicable option):

1. **`scrape` with CSS selectors** — extracts only relevant elements before the LLM
   sees anything. Deterministic, free, and the best default when the target is HTML.
2. **Python filtering** — list comprehensions, subscript access, or string slicing between
   the fetch step and the LLM step. Use when data is structured (JSON, CSV) or when
   `scrape` already returned a list you want to narrow.
3. **Targeted API parameters** — query params or path segments that limit what the server
   returns (e.g. `?zone=snoqualmie`, `?limit=10`). Use when the API supports it.
4. **Full content as last resort** — only when none of the above apply (e.g. a JSON API
   without filtering params whose response must be forwarded whole). Add a comment
   acknowledging the tradeoff.

### Don't

```python
# BAD: dumps entire API response into LLM — wastes tokens, degrades focus
data = await workflow.execute_activity("api", {"url": url})
result = await workflow.execute_activity(
    "llm",
    {"prompt": f"What is the current temperature?\n\n{data['body']}"},
    start_to_close_timeout=timedelta(seconds=60),
)
```

### Do

```python
# GOOD: scrape only the relevant elements, then pass the small result to LLM
conditions = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "temp": ".current-temp",
            "visibility": ".visibility",
            "forecast": ".forecast-text",
        },
    },
)

# Python: pull out just the first match for each field (deterministic)
temp = (conditions["results"].get("temp") or ["unknown"])[0]
vis = (conditions["results"].get("visibility") or ["unknown"])[0]
forecast = (conditions["results"].get("forecast") or [""])[0]

result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Temperature: {temp}\nVisibility: {vis}\nForecast: {forecast}\n\nSummarize conditions.",
        "schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)
return {"summary": result["summary"]}
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

## Key Rules

1. **Write only the method body** — no imports, no class, no decorators.
2. **Return a `dict`** from the code block — always.
3. **Match input names** — use variable names that match frontmatter `inputs` keys.
4. **Default timeout is 30s** — omit `start_to_close_timeout` unless you need more.
5. **Never import** — `workflow`, `RetryPolicy`, `timedelta`, `asyncio`, `json`, `re`, `math`, `collections`, and `urllib.parse` are always available.
6. **Use `workflow.now()` for the current time** — returns a timezone-aware `datetime`. `datetime.now()` is not available.
7. **Model names** — use `claude-haiku-4-5-20251001` for fast/cheap, `claude-sonnet-4-6` for quality.

## Example: Monitor a Product Price

```
---
name: price-monitor
description: Scrapes a product page and returns the current price.
inputs:
  url:
    type: str
    default: "https://example.com/product"
---

# Price Monitor

Fetches a product page and extracts the current price via CSS selector.

\```python
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {"price": ".price, [data-price], #price"},
    },
)

prices = page["results"].get("price", [])
if not prices:
    return {"price": None, "found": False}

return {"price": prices[0], "found": True}
\```
```

## Output Format

When generating or updating a workflow, call the `save_workflow` tool with the complete SKILL.md file content as the `markdown` parameter. In your text response, follow these rules:

1. **Describe workflows by what they do**, not how they work.
   - Do: "This workflow checks the price on that product page and tells you what it found"
   - Don't: "This workflow uses scrape with a CSS selector and returns a dict"

2. **Describe inputs in plain language**, not type annotations.
   - Do: "You can give it a URL to check (it defaults to the example page if you don't)"
   - Don't: "Input: url (str, defaults to 'https://example.com/product')"

3. **Describe outputs in plain language**.
   - Do: "It will tell you the current price, or let you know if it couldn't find one"
   - Don't: "Output: price (str | None), found (bool)"

4. **Never use implementation jargon** — Python, activity, Temporal, dict, schema, execute_activity, RetryPolicy, timedelta, asyncio, code block, frontmatter, method body, deterministic, inference. The technical patterns are for code generation, not the user.

5. **Frame everything around the user's goal** — "You can run this to get a daily summary of..."

6. **Ask follow-up questions in plain terms** — "Would you like it to check multiple pages?" not "Should I add a loop over a list of URLs?"

7. **Never include raw SKILL.md content** in your text response — the tool call handles delivery.

### Tool contract

- **Tool name:** `save_workflow`
- **Parameter:** `markdown` (string) — the complete SKILL.md file content (frontmatter + body + code block)
- **Behavior:** Saves or updates the workflow file. Each integration implements this tool in its platform's native format.
