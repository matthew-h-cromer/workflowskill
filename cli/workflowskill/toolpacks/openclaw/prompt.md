# Available Actions (OpenClaw)

You are authoring a workflow for the **OpenClaw** agent platform. The actions below are OpenClaw's native tools, registered for use via `workflow.execute_activity("name", args_dict, ...)`.

---

## `exec`

Run a shell command and return its output.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `command` | `str` | yes | — | Shell command to execute |
| `workdir` | `str` | no | cwd | Working directory |
| `env` | `dict` | no | — | Additional environment variables |
| `timeout` | `int` | no | `60` | Kill timeout in seconds |

Output: `output` (str), `exit_code` (int), `status` ("done" \| "error")

```python
# Run a shell command
result = await workflow.execute_activity(
    "exec",
    {"command": "git log --oneline -10"},
    start_to_close_timeout=timedelta(seconds=30),
)
log = result["output"]
```

---

## `browser`

Control a headless Chromium browser. All browser actions share a single persistent context.

**Key actions:**

| `action` value | Required params | Returns |
|----------------|-----------------|---------|
| `"navigate"` | `url` (str) | `url`, `status` |
| `"snapshot"` | — | `snapshot` (text content of page), `url` |
| `"screenshot"` | — | `path` (local file path) |
| `"click"` | `ref` (str, CSS selector) | `clicked` |
| `"type"` | `ref` (str), `text` (str), `submit` (bool) | `typed` |
| `"wait"` | `text` or `url` or `timeout_ms` | `waited` |
| `"tabs"` | — | `tabs` (list) |
| `"open"` | `url` (str) | `tab_id`, `url` |
| `"close"` | `tab_id` (int) | `closed` |
| `"status"` | — | `status`, `tabs` |

```python
# Navigate and extract page content
await workflow.execute_activity(
    "browser",
    {"action": "navigate", "url": "https://example.com"},
    start_to_close_timeout=timedelta(seconds=30),
)
snap = await workflow.execute_activity(
    "browser",
    {"action": "snapshot"},
    start_to_close_timeout=timedelta(seconds=15),
)
content = snap["snapshot"]
```

```python
# Fill and submit a form
await workflow.execute_activity(
    "browser",
    {"action": "navigate", "url": "https://example.com/search"},
    start_to_close_timeout=timedelta(seconds=30),
)
await workflow.execute_activity(
    "browser",
    {"action": "type", "ref": "input[name=q]", "text": query, "submit": True},
    start_to_close_timeout=timedelta(seconds=15),
)
result = await workflow.execute_activity(
    "browser",
    {"action": "snapshot"},
    start_to_close_timeout=timedelta(seconds=15),
)
```

---

## `web_search`

Search the web and return structured results. Requires `BRAVE_API_KEY` environment variable.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | `str` | yes | — | Search query |
| `count` | `int` | no | `5` | Number of results (max 10) |
| `country` | `str` | no | — | 2-letter ISO country code |
| `language` | `str` | no | — | ISO 639-1 language code |
| `freshness` | `str` | no | — | `"day"`, `"week"`, `"month"`, or `"year"` |

Output: `results` (list of `{title, url, description}`), `query` (str)

```python
# Search the web
search = await workflow.execute_activity(
    "web_search",
    {"query": f"{topic} site:docs.example.com", "count": 5},
    start_to_close_timeout=timedelta(seconds=15),
)
urls = [r["url"] for r in search["results"]]
```

---

## `web_fetch`

Fetch a URL and return its readable content.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | `str` | yes | — | http/https URL to fetch |
| `extractMode` | `str` | no | `"markdown"` | `"markdown"` or `"text"` |
| `maxChars` | `int` | no | `50000` | Truncate long pages |

Output: `content` (str), `url` (str), `status` (int)

```python
# Fetch a page as markdown
page = await workflow.execute_activity(
    "web_fetch",
    {"url": url, "maxChars": 10000},
    start_to_close_timeout=timedelta(seconds=30),
)
content = page["content"]
```

---

## `llm_task`

Call an LLM for a structured inference task. Returns JSON-only output.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | `str` | yes | — | Task instruction |
| `input` | `any` | no | — | Data for the LLM to process |
| `schema` | `dict` | no | — | JSON schema the output must match |
| `model` | `str` | no | `"claude-sonnet-4-6"` | Model identifier |
| `temperature` | `float` | no | — | Sampling temperature |
| `maxTokens` | `int` | no | `4096` | Max output tokens |

Output: parsed JSON object — access fields as `result["field_name"]`.

```python
# Classify content
classification = await workflow.execute_activity(
    "llm_task",
    {
        "prompt": "Classify the sentiment of this text.",
        "input": text,
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
                "confidence": {"type": "number"},
            },
            "required": ["sentiment", "confidence"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)
sentiment = classification["sentiment"]
```

---

## `read`

Read a file and return its contents.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | File path to read |
| `encoding` | `str` | no | Text encoding (default: `"utf-8"`) |

Output: `content` (str), `path` (str), `size` (int)

---

## `write`

Write content to a file, creating it and parent directories as needed.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | File path to write |
| `content` | `str` | yes | Content to write |
| `encoding` | `str` | no | Text encoding (default: `"utf-8"`) |

Output: `path` (str), `size` (int), `created` (bool)

---

## `edit`

Replace text in an existing file.

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | `str` | yes | — | File path to edit |
| `old_string` | `str` | yes | — | Text to find |
| `new_string` | `str` | yes | — | Replacement text |
| `replace_all` | `bool` | no | `false` | Replace all occurrences |

Output: `path` (str), `replacements` (int)

---

## When to use `llm_task` vs pure Python vs `browser`/`web_fetch`

**Use `llm_task` for:** summarization, classification, sentiment analysis, translation, creative generation, extracting meaning from unstructured text.

**Use pure Python for:** counting, filtering, string formatting, math, restructuring dicts, conditional logic on known fields.

**Use `web_fetch` (not `llm_task`) for:** fetching and extracting content from a known URL when you don't need inference — just the text.

**Use `browser` when:** the page requires JavaScript to render, or you need to interact with it (click, type, navigate through forms). Use `web_fetch` for static pages.

### Minimize LLM input

Send only what `llm_task` needs. Prefer `web_fetch` with `maxChars` to truncate, or extract relevant sections with pure Python before passing to `llm_task`.
