---
name: workflow-author
description: Generate valid Python Temporal workflows in SKILL.md format for the WorkflowSkill workflow engine.
---

# WorkflowSkill Workflow Author

Read `skill/SKILL.md` for the full authoring guide — it is the single source of truth for SKILL.md format, workflow patterns, available actions, and validation rules.

## Output

After generating the workflow, **write it to a file** in the `examples/` directory. Derive the filename from the workflow name in the frontmatter (e.g. `name: github-activity` → `examples/github-activity.md`). Confirm the file path to the user after writing it.

## Available actions (CLI built-ins)

When authoring workflows to run via `workflowskill run`, these actions are pre-registered and can be called via `workflow.execute_activity("name", args_dict, start_to_close_timeout=...)`.

### `web_fetch`

Fetch a URL and return its content as markdown or plain text.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | `str` | yes | — | URL to fetch |
| `extract` | `"markdown" \| "text"` | no | `"markdown"` | Output format |

Output: `content` (str), `url` (str)

Example:

```python
page = await workflow.execute_activity(
    "web_fetch",
    {"url": url, "extract": "markdown"},
    start_to_close_timeout=timedelta(seconds=30),
)
content = page["content"]
```

### `web_fetch_raw`

Fetch a URL and return the raw response body without conversion. Use for API endpoints returning JSON or other structured data.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `str` | yes | URL to fetch |
| `method` | `str` | no | HTTP method (default: `"GET"`) |
| `headers` | `dict` | no | Request headers |
| `body` | `str` | no | Request body (not allowed with GET) |

Output: `content` (str), `url` (str), `content_type` (str), `status` (int)

### `web_scrape`

Fetch a web page and extract structured text via CSS selectors.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `str` | yes | URL to scrape |
| `selectors` | `dict[str, str]` | yes | Map of name → CSS selector |
| `headers` | `dict` | no | Request headers |

Output: `status` (int), `results` (dict[str, list[str]])

Example:

```python
page = await workflow.execute_activity(
    "web_scrape",
    {"url": url, "selectors": {"prices": ".price", "titles": "h2"}},
    start_to_close_timeout=timedelta(seconds=30),
)
prices = page["results"].get("prices", [])
```

### `llm`

Call Claude and return a parsed JSON object.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | `str` | yes | — | User message |
| `system` | `str` | no | — | System prompt |
| `schema` | `dict` | no | — | JSON schema the response must match |
| `model` | `str` | no | `"claude-sonnet-4-6"` | Claude model ID |

Output: parsed JSON object — access fields as `result["field_name"]`.

Requires `ANTHROPIC_API_KEY` environment variable.

Example:

```python
summary = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Summarize:\n\n{content}",
        "schema": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]},
    },
    start_to_close_timeout=timedelta(seconds=60),
)
text = summary["summary"]
```
