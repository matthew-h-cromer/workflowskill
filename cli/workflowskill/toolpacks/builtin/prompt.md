# Available Actions

When authoring workflows for the builtin runtime (`workflowskill run`), these actions are pre-registered and can be called via `workflow.execute_activity("name", args_dict)`.

**Timeouts:** The default timeout is 30 seconds. Only add `start_to_close_timeout=timedelta(seconds=N)` when you need a value other than 30s (e.g., long-running LLM calls or slow scrapes).

## `exec`

Run a shell command and return its output. Use for calling CLI tools, running scripts, or any local system command.

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

## `api`

Make an HTTP request and return the raw response body. Use for API endpoints returning JSON or other structured data.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `str` | yes | URL to fetch |
| `method` | `str` | no | HTTP method (default: `"GET"`) |
| `headers` | `dict` | no | Request headers |
| `body` | `str` | no | Request body (not allowed with GET) |

Output: `content` (str), `url` (str), `content_type` (str), `status` (int)

Example:

```python
result = await workflow.execute_activity(
    "api",
    {"url": url},
)
data = result["content"]  # parse JSON with json.loads if needed (use pure Python)
```

## `scrape`

Fetch a web page and extract structured text via CSS selectors.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `str` | yes | URL to scrape |
| `selectors` | `dict[str, str \| dict]` | yes | Map of name → selector (string or object) |
| `headers` | `dict` | no | Request headers |

Output: `status` (int), `results` (dict[str, list[str]])

**Selector forms:**

- **String** — extract text content: `"titles": "h2"`
- **Object** — extract a specific attribute or inner HTML:
  - `"links": {"css": "a", "extract": "href"}` — extracts the `href` attribute
  - `"images": {"css": "img", "extract": "src"}` — extracts the `src` attribute
  - `"body": {"css": "div.content", "extract": "html"}` — extracts inner HTML

When you need both the text **and** an attribute from the same elements, use two named selectors in a single call — do not make two separate `scrape` calls.

Example — extracting link text and hrefs in one call:

```python
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "link_texts": "a",
            "link_hrefs": {"css": "a", "extract": "href"},
        },
    },
)
texts = page["results"].get("link_texts", [])
hrefs = page["results"].get("link_hrefs", [])
links = [{"text": t, "href": h} for t, h in zip(texts, hrefs)]
```

Simple text extraction:

```python
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"prices": ".price", "titles": "h2"}},
)
prices = page["results"].get("prices", [])
```

## `llm`

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

---

## When to use `llm` vs pure Python vs `scrape`

Use pure Python for parsing, transforming, filtering, and formatting data. Only call `llm` when the task genuinely requires inference.

**Use `llm` for:** summarization, classification, sentiment analysis, translation, creative generation, extracting meaning from unstructured text.

**Use pure Python for:** counting items, filtering lists, string formatting, math, restructuring dicts, conditional logic on known fields.

**Use `scrape` (not `llm`) for:** extracting specific elements from HTML (titles, prices, links, headings). CSS selectors are deterministic and free.

### Minimize LLM input

When feeding fetched data into `llm`, send only what the model needs.

**Strategy ladder** (use the highest applicable option):

1. **`scrape` with CSS selectors** — extracts only relevant elements before the LLM sees anything.
2. **Python filtering** — list comprehensions, subscript access, or string slicing between the fetch step and the LLM step.
3. **Targeted API parameters** — query params or path segments that limit what the server returns.
4. **Full content as last resort** — only when none of the above apply. Add a comment acknowledging the tradeoff.
