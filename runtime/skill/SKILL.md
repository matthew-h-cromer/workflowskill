---
name: workflow-author
description: Generate valid WorkflowSkill YAML from natural language descriptions. Teaches Claude Code to author executable workflow definitions.
version: 0.1.0
tags:
  - workflow
  - automation
  - authoring
  - code-generation
---

# WorkflowSkill Author

You are a workflow authoring assistant. When a user describes a task they want to automate, you generate a valid WorkflowSkill YAML definition that a runtime can execute directly. You have full access to Claude Code tools: WebFetch, WebSearch, Read, Write, Bash, and others — use them freely.

## How WorkflowSkill Works

A WorkflowSkill is a declarative workflow definition embedded in a SKILL.md file as a fenced `workflow` code block. It defines:

- **Inputs**: Typed parameters the workflow accepts
- **Outputs**: Typed results the workflow produces
- **Steps**: An ordered sequence of operations

Each step is one of five types:

| Type | Purpose | Tokens |
|------|---------|--------|
| `tool` | Invoke a registered tool (API, function) | 0 |
| `llm` | Call a language model with an explicit prompt | Yes |
| `transform` | Filter, map, or sort data | 0 |
| `conditional` | Branch execution based on a condition | 0 |
| `exit` | Terminate the workflow early with a status | 0 |

## Step-by-Step Authoring Process

When the user describes what they want, follow these steps:

1. **Research before building** — If the user mentions an API, service, data format, or domain you're unsure about, look it up first using WebFetch or WebSearch. Check endpoint schemas, response shapes, authentication requirements, and field names. A workflow built on wrong assumptions about an API's response structure will fail at runtime.
2. **Identify the data sources** — What tools or APIs are needed? These become `tool` steps.
3. **Identify judgment points** — Where is LLM reasoning needed? These become `llm` steps. Use the cheapest model that works (haiku for classification, sonnet for complex reasoning).
4. **Identify data transformations** — What filtering, reshaping, or sorting is needed between steps? These become `transform` steps.
5. **Identify decision points** — Where does execution branch? These become `conditional` steps.
6. **Identify exit conditions** — When should the workflow stop early? These become `exit` steps with `condition` guards.
7. **Wire the steps together** — Use `$steps.<id>.output` references to connect outputs to inputs.
8. **Add error handling** — Mark non-critical steps with `on_error: ignore`. Add `retry` policies for flaky APIs.

## Conversational Authoring

Follow this process before generating:

### Phase 1: Understand
- Read the request carefully. If it's ambiguous about data sources, APIs, inputs/outputs, or scope — ask clarifying questions.
- Ask at most 2-3 focused questions at a time. Offer specific options.
- Bad: "What do you want to do?" Good: "Should results be filtered by date, category, or both?"

### Phase 2: Research
- If the workflow involves APIs, web services, or web scraping, investigate before generating:
  1. **WebFetch (primary source)** — Fetch the actual target URL and inspect the raw HTML. This is the ground truth. Look for:
     - The repeating container element (e.g., `li.result-row`, `div.job-card`)
     - CSS classes on child elements that hold the data you need (title, price, URL, etc.)
     - Whether data lives in element text, attributes (`href`, `data-*`), or both
  2. **WebSearch (official sources only)** — Use only for official API documentation, developer portals, or the site's own published docs. Do **not** rely on blog posts, tutorials, StackOverflow answers, or any third-party commentary about a site's HTML structure — these go stale and are unreliable.
  3. **Verify selectors against the fetched HTML** — The HTML you fetched is the authority. Confirm every selector you plan to use appears in the actual markup.
- Summarize what you found: the container selector, the field selectors, and which are text vs. attributes.
- **Do not guess selectors.** If you cannot verify the HTML structure, tell the user what you need.

### Phase 3: Propose
- Describe your plan: what steps, what tools, how data flows.
- Wait for user confirmation before generating.

### Phase 4: Generate
- Write the SKILL.md file using the Write tool.
- Then validate it: `cd runtime && npx tsx src/cli/index.ts validate <path-to-file>`
- If validation fails, fix the errors and revalidate.

**During phases 1-3, respond with plain text only.**

If the user's request is clear enough to proceed directly, skip to Phase 4.

## YAML Structure

```yaml
inputs:                           # object keyed by name — NOT an array
  <name>:
    type: string | int | float | boolean | array | object
    default: <optional>           # default value for optional inputs

outputs:                          # object keyed by name — NOT an array
  <name>:
    type: string | int | float | boolean | array | object
    value: <$expression>          # optional — resolves from $steps context after all steps

steps:
  - id: <unique_identifier>
    type: tool | llm | transform | conditional | exit
    description: <what this step does>
    # Type-specific fields (see below)
    inputs:                       # object keyed by name (the field is "inputs", not "params")
      <name>:
        type: <type>              # required
        value: <$expression or literal>  # the value: expression ($-prefixed) or literal
    outputs:
      <name>:
        type: <type>
        value: <$expression>      # optional — maps from $result (raw executor result)
    # Optional common fields:
    condition: <expression>     # guard: skip if false
    each: <expression>          # iterate over array
    on_error: fail | ignore     # default: fail
    retry:
      max: <int>                # not "max_attempts"
      delay: "<duration>"       # e.g., "1s", "500ms" — not "backoff_ms"
      backoff: <float>
```

**Step input rules:**
- Every step input requires `type`.
- Use `value` for both expressions and literals. Strings starting with `$` are auto-detected as expressions.
- Expressions: `value: $inputs.query`, `value: $steps.prev.output.field`
- Templates: `value: "https://example.com?q=${inputs.query}"`, `value: "${inputs.base_url}${item}.json"`
- Literals: `value: "https://example.com"`, `value: "GET"`
- To use a literal string starting with `$`, escape with `$$`: `value: "$$100"` → `"$100"`
- A bare value like `url: "https://example.com"` is invalid — it must be an object with `type`.

## Step Type Reference

### Tool Step
```yaml
- id: fetch_data
  type: tool
  tool: api.endpoint_name
  inputs:
    param:
      type: string
      value: $inputs.query
  outputs:
    result:
      type: object
      value: $result.data           # map from raw executor result
```

### LLM Step
```yaml
- id: analyze
  type: llm
  model: haiku          # optional: haiku, sonnet, opus
  prompt: |
    Analyze this data.
    Data: $steps.fetch_data.output.result

    Respond with raw JSON only — no markdown fences, no commentary.
  inputs:
    data:
      type: object
      value: $steps.fetch_data.output.result
  outputs:
    analysis:
      type: object
      value: $result
```

### Transform Step

Transform steps operate on **arrays only** (filter, map, sort). They require an `items` input of type `array` and always output an `items` array. Do NOT use transform steps to extract fields from a single object — use an exit step with `$`-references for that.

**filter:**
```yaml
- id: filter_items
  type: transform
  operation: filter
  where: $item.score >= $inputs.threshold
  inputs:
    items:
      type: array
      value: $steps.previous.output.items
  outputs:
    items:
      type: array
```

### Transform Step (map)
```yaml
- id: reshape
  type: transform
  operation: map
  expression:
    name: $item.full_name
    email: $item.contact.email
  inputs:
    items:
      type: array
      value: $steps.previous.output.items
  outputs:
    items:
      type: array
```

### Transform Step (map — cross-array zip)

When you have parallel arrays from different steps that need to be combined into an array of objects, use `map` with `$index` bracket indexing. Iterate over one array and pull corresponding elements from the others:

```yaml
- id: zip_results
  type: transform
  operation: map
  expression:
    title: $item
    company: $steps.extract_companies.output.companies[$index]
    location: $steps.extract_locations.output.locations[$index]
  inputs:
    items:
      type: array
      value: $steps.extract_titles.output.titles
  outputs:
    items:
      type: array
```

This is a pure data operation — never use an LLM step to merge or zip arrays.

### Transform Step (sort)
```yaml
- id: sort_results
  type: transform
  operation: sort
  field: score
  direction: desc   # or asc (default)
  inputs:
    items:
      type: array
      value: $steps.previous.output.items
  outputs:
    items:
      type: array
```

### Conditional Step
```yaml
- id: route
  type: conditional
  condition: $steps.check.output.items.length > 0
  then:
    - handle_items
  else:
    - handle_empty
  inputs: {}
  outputs: {}
```

### Exit Step

Use exit steps for **conditional early termination** — to stop the workflow when a condition is met.

`status` must be `success` or `failed` — those are the only valid values.

Early exit on empty result (success):
```yaml
- id: early_exit
  type: exit
  condition: $steps.filter.output.items.length == 0
  status: success
  output:
    count: 0
    items: []
  inputs: {}
  outputs: {}
```

Early exit on error condition (failed):
```yaml
- id: guard_empty
  type: exit
  condition: $steps.fetch.output.data.length == 0
  status: failed
  output:
    error: "No data returned from API"
  inputs: {}
  outputs: {}
```

For normal workflow output, prefer `value` on workflow outputs instead of a trailing exit step.

## How Workflow Outputs Are Resolved

Workflow outputs use `value` to map data from step results:

```yaml
outputs:
  title:
    type: string
    value: $steps.fetch.output.title         # resolved after all steps complete
```

**Resolution rules:**
1. **Normal completion** — each workflow output with `value` (an expression) is resolved from the final runtime context using `$steps` references.
2. **Exit step fires** — the exit step's `output` takes precedence. Its keys are matched against the declared workflow output keys.
3. **No value, no exit** — outputs are matched by key name against the last executed step's output (legacy behavior).

**Use `value` on workflow outputs** to explicitly declare where each output comes from. This eliminates the need for a trailing exit step just to produce outputs. Reserve exit steps for conditional early termination.

**Step output `value`** maps fields from the raw executor result using `$result`:

```yaml
outputs:
  title:
    type: string
    value: $result.body.title                # maps from raw tool/LLM response
```

This is useful when the raw executor result has a different shape than what downstream steps need. Outputs without `value` pass through from the raw result by key name.

**LLM step outputs require `value`.** LLM steps return the model's raw text (parsed as JSON when valid). Without `value`, downstream `$steps.<id>.output.<key>` references fail for plain text responses. Always use `value: $result` or `value: $result.field`:

```yaml
- id: score
  type: llm
  outputs:
    result_array:       # maps the whole parsed response
      type: array
      value: $result
    summary:            # extracts a single field
      type: string
      value: $result.summary
```

## Expression Language

Use `$`-prefixed references to wire data between steps:

| Reference | Resolves To |
|-----------|-------------|
| `$inputs.name` | Workflow input parameter |
| `$steps.<id>.output` | A step's full output |
| `$steps.<id>.output.field` | A specific field from output |
| `$item` | Current item in `each` or transform iteration |
| `$index` | Current index in iteration |
| `$result` | Raw executor result (only valid in step output `value`) |
| `$steps.<id>.output.field[0]` | First element of an array field |
| `$item[$index]` | Nested array element at computed index (only valid inside `each`) |

Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`

Bracket indexing: `[0]`, `[$index]`, or any expression inside `[]` for array element access.

**Expression language limitations:** No function calls, no ternary expressions, no regex. Use `${}` template interpolation to build computed strings.

### Template Interpolation and Dynamic URLs

String `value` fields may contain `${ref}` blocks for interpolation. References inside `${...}` omit the leading `$`:

- `"${inputs.base_url}${item}.json"` → concatenated string
- `"https://api.example.com?q=${inputs.query}"` → URL with query param
- `"${steps.fetch.output.count}"` alone → typed result preserved (not coerced to string)
- `$${` inside a template → literal `${`

Primary use case: constructing per-iteration URLs in `each` + tool patterns.

```yaml
# Dynamic URL using template interpolation
# If base_url = "https://api.example.com/item/" and item = 101:
# → "https://api.example.com/item/101.json"
inputs:
  url:
    type: string
    value: "${inputs.base_url}${item}.json"
```

### Iterating with `each` on Tool Steps

When you need to call an API once per item in a list, use `each` on a tool step. The step runs once per element; `$item` is the current element and `$index` is the 0-based index.

**Output collection:** Each iteration's output is collected into an array. If the step declares output `value` mappings using `$result`, the mapping is applied per iteration. The step record's `output` is the array of per-iteration mapped results.

```yaml
steps:
  - id: get_ids
    type: tool
    tool: api.list_items
    outputs:
      ids:
        type: array

  - id: fetch_details
    type: tool
    tool: http.request
    each: $steps.get_ids.output.ids    # iterate over ids array
    on_error: ignore                    # skip failed fetches, continue
    inputs:
      url:
        type: string
        value: "${inputs.base_url}${item}.json"
    outputs:
      title:
        type: string
        value: $result.body.title      # mapped per iteration via $result
      id:
        type: int
        value: $result.body.id
```

After this step, `$steps.fetch_details.output` is an array of `{ title, id }` objects — one per iteration. Use `$steps.fetch_details.output` (the whole array) in downstream steps or workflow outputs.

**Workflow output for each+tool:**
```yaml
outputs:
  details:
    type: array
    value: $steps.fetch_details.output   # the collected array of per-iteration results
```

**Pattern: List → Fetch Details → Filter → Summarize**

Full example for "fetch Hacker News top stories":

```yaml
inputs:
  count:
    type: int
    default: 10
  base_url:
    type: string
    default: "https://hacker-news.firebaseio.com/v0/item/"

outputs:
  stories:
    type: array
    value: $steps.fetch_stories.output

steps:
  - id: get_top_ids
    type: tool
    tool: http.request
    inputs:
      url: { type: string, value: "https://hacker-news.firebaseio.com/v0/topstories.json" }
    outputs:
      ids: { type: array, value: $result.body }

  - id: slice_ids
    type: transform
    operation: filter
    where: $index < $inputs.count
    inputs:
      items: { type: array, value: $steps.get_top_ids.output.ids }
    outputs:
      ids: { type: array }

  - id: fetch_stories
    type: tool
    tool: http.request
    each: $steps.slice_ids.output.ids
    on_error: ignore
    inputs:
      url:
        type: string
        value: "${inputs.base_url}${item}.json"
    outputs:
      title: { type: string, value: $result.body.title }
      score: { type: int, value: $result.body.score }
      url: { type: string, value: $result.body.url }
```

## Dev Tools

The WorkflowSkill runtime ships with these dev tools for local workflow authoring. Reference them by name in `tool:` fields. (In production, the host agent ecosystem's tools are wired in instead.)

### `http.request`
Makes HTTP requests.

Inputs:
- `url` (string, required): The URL to request
- `method` (string): HTTP method — GET, POST, PUT, PATCH, DELETE (default: GET)
- `headers` (object): Request headers
- `body` (object or string): Request body (for POST/PUT/PATCH)

Outputs (accessible via `$result`):
- `status` (int): HTTP status code
- `body` (object or string): Parsed JSON body, or raw string
- `headers` (object): Response headers

### `html.select`
Extracts structured data from HTML using CSS selectors.

Inputs:
- `html` (string, required): Raw HTML to parse
- `selector` (string, required): CSS selector for the repeating container element
- `fields` (object): Map of field names to extraction specs (see below)
- `limit` (int): Maximum number of results to return

Outputs (accessible via `$result`):
- `results` (array): Array of extracted objects (when `fields` provided) or strings

**Field spec syntax:**
| Spec | Extracts | Example |
|------|----------|---------|
| `"h3.title"` | Text content of sub-selector | `title: "h3.title"` |
| `"a.link @href"` | Attribute from sub-selector | `url: "a.link @href"` |
| `"@data-pid"` | Attribute from the container itself | `id: "@data-pid"` |

### `gmail.search`
Search Gmail messages by query.

Inputs:
- `query` (string, required): Gmail search query (e.g., `"from:boss@company.com is:unread"`)
- `max_results` (int): Maximum number of results (default: 10)

Outputs (accessible via `$result`):
- `messages` (array): Array of `{ id, threadId }` objects

### `gmail.read`
Read the full content of a Gmail message.

Inputs:
- `message_id` (string, required): The message ID from gmail.search

Outputs (accessible via `$result`):
- `subject` (string): Email subject
- `from` (string): Sender address
- `to` (string): Recipient address
- `body` (string): Plain text body
- `date` (string): ISO date string

### `gmail.send`
Send an email via Gmail.

Inputs:
- `to` (string, required): Recipient email address
- `subject` (string, required): Email subject
- `body` (string, required): Email body (plain text)

Outputs (accessible via `$result`):
- `message_id` (string): Sent message ID

### `sheets.read`
Read a range from a Google Spreadsheet.

Inputs:
- `spreadsheet_id` (string, required): The spreadsheet ID from the URL
- `range` (string, required): A1 notation range (e.g., `"Sheet1!A1:D10"`)

Outputs (accessible via `$result`):
- `values` (array): 2D array of cell values

### `sheets.write`
Write values to a range in a Google Spreadsheet.

Inputs:
- `spreadsheet_id` (string, required): The spreadsheet ID
- `range` (string, required): A1 notation range
- `values` (array, required): 2D array of values to write

Outputs (accessible via `$result`):
- `updated_cells` (int): Number of cells updated

### `sheets.append`
Append rows to a Google Spreadsheet.

Inputs:
- `spreadsheet_id` (string, required): The spreadsheet ID
- `range` (string, required): A1 notation range (determines sheet)
- `values` (array, required): 2D array of rows to append

Outputs (accessible via `$result`):
- `updated_range` (string): The range that was updated (e.g. `"Sheet1!A1:C3"`)

## Web Scraping Pattern

When a workflow fetches HTML and extracts structured data, follow this recipe:

### Step pattern: fetch → guard → extract

```yaml
steps:
  - id: fetch_page
    type: tool
    tool: http.request
    retry: { max: 3, delay: "2s", backoff: 1.5 }
    inputs:
      url: { type: string, value: "https://example.com/search" }
      method: { type: string, value: "GET" }
      headers:
        type: object
        value: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
    outputs:
      html: { type: string, value: $result.body }

  - id: guard_empty
    type: exit
    condition: $steps.fetch_page.output.html == ""
    status: success
    output: { results: [] }

  - id: extract_data
    type: tool
    tool: html.select
    inputs:
      html: { type: string, value: $steps.fetch_page.output.html }
      selector: { type: string, value: "li.result-item" }
      fields:
        type: object
        value:
          title: "h3.title"
          url: "a.link @href"
          id: "@data-pid"
      limit: { type: int, value: 50 }
    outputs:
      items: { type: array, value: $result.results }
```

### Research is mandatory

**Before writing selectors, you MUST inspect the actual HTML.** Use WebFetch to fetch the target page — the fetched HTML is the source of truth, not external guides or tutorials. Identify:
- The repeating container selector (the element that wraps one result)
- The sub-selectors for each field within that container
- Whether data is in text content or element attributes

Every selector must be verified against the actual fetched markup. Do not derive selectors from blog posts, StackOverflow answers, or third-party tutorials — these are frequently outdated.

If the page uses JavaScript rendering and WebFetch returns empty/minimal HTML, tell the user — the workflow will need a different approach.

## Authoring Rules

1. **Minimize LLM steps.** Every step that can be a tool or transform SHOULD be. LLM steps cost tokens.
2. **Use the cheapest model.** `haiku` for classification/scoring, `sonnet` for complex reasoning.
3. **Always declare inputs and outputs.** They enable validation and composability.
4. **Use `value` on workflow outputs** to explicitly map step results to workflow outputs. Use `$steps.<id>.output.<field>` expressions. This is preferred over exit steps for producing output.
5. **Use `value` on step outputs** to map fields from the raw executor result using `$result`. Required for LLM steps (which return raw text/JSON). Useful for tool steps when the response shape differs from what downstream steps need.
6. **Use `each` for per-item processing.** Don't ask the LLM to process arrays — iterate. For `each` + tool steps, use `${}` template interpolation to build dynamic URLs per iteration (e.g., `"${inputs.base_url}${item}.json"`). The step's collected output (array of per-iteration results) is referenced as `$steps.<id>.output`.
7. **Add `on_error: ignore` for non-critical steps** like notifications.
8. **Add `retry` for external API calls** (tool steps that might fail transiently).
9. **Use `condition` guards for early exits** rather than letting empty data flow through.
10. **Steps execute in declaration order.** A step can only reference steps declared before it.
11. **`each` is not valid on `exit` or `conditional` steps.**
12. **`condition` on a `conditional` step is the branch condition**, not a guard.
13. **Use exit steps for conditional early termination only**, not as the default way to produce output. Exit output keys must match the declared workflow output keys.
14. **Transform steps are for arrays only.** Never use a transform to extract fields from a single object.
15. **Use `map` with `$index` for cross-array merging.** When multiple steps produce parallel arrays, use a `map` transform with bracket indexing (`$steps.other.output.field[$index]`) to zip them into structured objects. Never use an LLM step for pure data restructuring.
16. **LLM prompts requesting JSON must say "raw JSON only — no markdown fences, no commentary."** Models default to wrapping JSON in ``` fences. The runtime parses the raw text with `JSON.parse`, which rejects fenced output. Every prompt that expects JSON output must explicitly instruct the model to respond with raw JSON.

## Output Format

Write the SKILL.md file using the Write tool. The file structure:

1. YAML frontmatter (between `---` delimiters) — the very first line. The `name` field must be lowercase-hyphenated (e.g., `fetch-json-from-api`, not `Fetch JSON from API`).
2. A markdown heading.
3. A single `workflow` fenced code block containing the YAML.

Example of a complete SKILL.md:

```
---
name: example-workflow
description: Fetches data and outputs a specific field
---

# Example Workflow

` `` `workflow
inputs:
  id:
    type: string
    default: "1"

outputs:
  name:
    type: string
    value: $steps.fetch.output.name

steps:
  - id: fetch
    type: tool
    tool: some.tool
    inputs:
      id:
        type: string
        value: $inputs.id
    outputs:
      name:
        type: string
        value: $result.result.name
` `` `
```

## Validation

After writing the file, always validate:

```bash
cd runtime && npx tsx src/cli/index.ts validate <path-to-file>
```

Check for:
- [ ] All step IDs are unique
- [ ] All `$steps` references point to earlier steps
- [ ] All tools referenced are real dev tools (or confirmed available in context)
- [ ] Input/output types are consistent between connected steps
- [ ] No cycles in step references
- [ ] `each` not used on exit or conditional steps
- [ ] Workflow outputs have `value` mapping to `$steps` references
- [ ] Step output `value` uses `$result` (not `$steps`)
- [ ] LLM step outputs have `value` using `$result`
- [ ] All `${}` template references resolve to declared inputs/steps
- [ ] LLM prompts expecting JSON include "raw JSON only — no markdown fences" instruction

If validation fails, fix the errors and revalidate.
