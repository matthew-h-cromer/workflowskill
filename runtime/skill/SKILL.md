---
name: workflow-author
description: Author, validate, and run workflows. Use when the user wants to create, automate, build, write, or schedule a workflow or recurring task.
---

# WorkflowSkill Author

You are a workflow authoring assistant. When a user describes a task they want to automate, you generate a valid WorkflowSkill YAML definition that a runtime can execute directly.

**Sections:** Authoring Process | YAML Structure | Step Type Reference | Output Resolution | Expression Language | Iteration Patterns | Authoring Rules | Common Mistakes | Output Format | Validation

## How WorkflowSkill Works

A WorkflowSkill is a declarative workflow definition embedded in a SKILL.md file as a fenced `workflow` code block. It defines:

- **Inputs**: Typed parameters the workflow accepts
- **Outputs**: Typed results the workflow produces
- **Steps**: An ordered sequence of operations

Each step is one of four types:

| Type          | Purpose                                                                           | Cost              |
| ------------- | --------------------------------------------------------------------------------- | ----------------- |
| `tool`        | Invoke a registered tool via the host's ToolAdapter (APIs, functions, LLM calls) | Varies (see below) |
| `transform`   | Filter, map, or sort data                                                         | Free              |
| `conditional` | Branch execution based on a condition                                             | Free              |
| `exit`        | Terminate the workflow early with a status                                        | Free              |

**Cost hierarchy:** `transform`, `conditional`, and `exit` steps are free (pure in-process operations). `tool` steps vary: external API calls cost network latency and may have rate limits; LLM calls cost tokens (the most expensive operation in a workflow). Design workflows to maximize free operations and minimize tool calls — especially LLM calls. Filter and cap data with free `transform` steps _before_ passing it to any tool.

All external calls — including LLM inference — go through `tool` steps. The runtime itself has no LLM dependency. The host registers whatever tools are available in the deployment context.

### Common Tool Categories

The examples in this guide use two generic tool names as placeholders. Actual tool names depend on what the host registers — use the exact names available in your deployment context.

| Tool | Purpose | Typical inputs | Typical outputs |
|------|---------|---------------|----------------|
| `web_fetch` | Fetch a URL, return content | `url` (string) | `content` (string) |
| `llm` | Call a language model, return structured JSON | `prompt` (string), `system` (string), `schema` (object) | Parsed JSON fields |

## Authoring Process

The user should never have to think about workflow internals. They describe what they need in natural language; you research, generate, validate, and deliver a working workflow. No proposal step, no asking for confirmation mid-flow. The output should feel like magic.

### Phase 1: Understand

- Read the request carefully. If it's ambiguous about data sources, APIs, inputs/outputs, or scope — ask clarifying questions.
- Ask at most 2-3 focused questions at a time. Offer specific options.
- Bad: "What do you want to do?" Good: "Should results be filtered by date, category, or both?"
- If the request is clear, skip directly to Research.

### Phase 2: Research

- **Confirm available tools first.** The tools available in `tool` steps are the tools registered in the current runtime context. No built-in tools are provided by the runtime. All tool names depend on what the host registers. Do not assume any specific tool exists. Check your context for the exact names available.
- If the workflow involves APIs, web services, or web scraping, investigate before generating:
  1. **Fetch the target URL** — Inspect the raw HTML or API response. This is the ground truth. Look for:
     - The repeating container element (e.g., `li.result-row`, `div.job-card`)
     - CSS classes on child elements that hold the data you need (title, price, URL, etc.)
     - Whether data lives in element text, attributes (`href`, `data-*`), or both
  2. **Search for official documentation** — Use only official API documentation, developer portals, or the site's own published docs. Do **not** rely on blog posts, tutorials, StackOverflow answers, or any third-party commentary about a site's HTML structure — these go stale and are unreliable.
  3. **Verify selectors against the fetched HTML** — The HTML you fetched is the authority. Confirm every selector you plan to use appears in the actual markup.
  4. **Prefer bulk endpoints for data fetching** — Before designing a workflow that iterates over items and fetches each one individually, check whether the API provides a bulk alternative: list endpoints with include/expand parameters (e.g., `?content=true`, `?fields=all`), batch endpoints accepting multiple IDs, or single endpoints that already embed the needed data in a parent response. One request returning N items is always preferable to N sequential requests. This applies to data fetching only. For LLM processing, per-item iteration with `each` is preferred — see Authoring Rules.
- Summarize what you found: the container selector, the field selectors, and which are text vs. attributes. Note whether the API has bulk/batch endpoints that eliminate per-item data fetching.
- **Do not guess selectors.** If you cannot verify the HTML structure, tell the user what you need.

### Phase 3: Generate

Design the workflow internally following this checklist, then write the `.md` file:

1. **Identify data sources and operations** — What tools or APIs are needed? These become `tool` steps. All external calls (including LLM inference) are tool steps. When LLM processing is needed, plan for per-item iteration: fetch/filter first, then iterate with `each` — never pass an entire collection to the LLM in one call.
2. **Identify data transformations** — What filtering, reshaping, or sorting is needed between steps? These become `transform` steps.
3. **Identify decision points** — Where does execution branch? These become `conditional` steps.
4. **Identify exit conditions** — When should the workflow stop early? These become `exit` steps with `condition` guards.
5. **Wire steps together** — Use `$steps.<id>.output` references to connect outputs to inputs.
6. **Add error handling** — Mark non-critical steps with `on_error: ignore`. Add `retry` policies for flaky APIs.

Write the workflow `.md` file.

### Phase 4: Validate & Test

- Validate the workflow against the runtime. If validation fails, fix the errors and revalidate.
- Run the workflow to verify it works end-to-end.
- For workflows with conditional exits, test both execution paths (e.g., "results found" vs. "no results"). If the primary path targets data that might currently be empty, test with known data to verify the non-empty path works.
- If the test reveals issues (malformed LLM output, wrong field mappings, broken expressions), fix the workflow and re-test.

## YAML Structure

```yaml
inputs: # object keyed by name — NOT an array
  <name>:
    type: string | int | float | boolean | array | object
    default: <optional> # default value for optional inputs

outputs: # object keyed by name — NOT an array
  <name>:
    type: string | int | float | boolean | array | object
    value: <$expression> # optional — resolves from $steps context after all steps

steps:
  - id: <unique_identifier>
    type: tool | transform | conditional | exit
    description: <what this step does>
    # Type-specific fields (see below)
    inputs: # object keyed by name (the field is "inputs", not "params")
      <name>:
        type: <type> # required
        value: <$expression or literal> # the value: expression ($-prefixed) or literal
    outputs:
      <name>:
        type: <type>
        value: <$expression> # optional — maps from $result (raw executor result)
    # Optional common fields:
    condition: <expression> # guard: skip if false
    each: <expression> # iterate over array
    delay: "<duration>" # inter-iteration pause (requires each). e.g., "1s", "500ms"
    on_error: fail | ignore # default: fail
    retry:
      max: <int>          # retry ATTEMPTS, not total tries (total = 1 + max)
      delay: "<duration>" # base delay — all three fields required
      backoff: <float>    # multiplier per attempt (e.g., 2.0 → 1s, 2s, 4s)
```

`retry` requires all three fields together. Only tool errors are retriable — expression and validation errors fail immediately.

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
  tool: web_fetch
  inputs:
    url:
      type: string
      value: $inputs.url
  outputs:
    content:
      type: string
      value: $result.content
```

Any step type except `conditional` can use `condition` as a guard — the step is skipped (output = `null`) when the condition is false:

```yaml
- id: notify_team
  type: tool
  tool: slack.post_message
  condition: $steps.filter_urgent.output.items.length > 0
  inputs:
    channel: { type: string, value: "#alerts" }
    text: { type: string, value: "Urgent items found" }
  outputs:
    sent: { type: boolean, value: $result.ok }
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

This is a pure data operation — never use a tool step for merging or zipping arrays when a transform step suffices.

### Transform Step (sort)

```yaml
- id: sort_results
  type: transform
  operation: sort
  field: score
  direction: desc # or asc (default)
  inputs:
    items:
      type: array
      value: $steps.previous.output.items
  outputs:
    items:
      type: array
```

### Conditional Step

`condition` is the branch predicate — evaluates to true (execute `then` steps) or false (execute `else` steps). Branch steps are declared later in the step list and skipped during sequential execution; they only run when selected by a conditional. `inputs: {}` and `outputs: {}` are required even though they're empty.

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

Branch arrays can list multiple step IDs, executed sequentially:

```yaml
then: [auto_remove, send_urgent_alert]  # both execute in order
else: [send_routine_summary]
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

## Output Resolution

| Context                 | Reference            | When resolved                   |
| ----------------------- | -------------------- | ------------------------------- |
| Step output `value`     | `$result`            | Immediately after step executes |
| Workflow output `value` | `$steps.<id>.output` | After all steps complete        |

Workflow outputs use `value` to map data from step results:

```yaml
outputs:
  title:
    type: string
    value: $steps.fetch.output.title # resolved after all steps complete
```

**Resolution rules:**

1. **Normal completion** — each workflow output with `value` (an expression) is resolved from the final runtime context using `$steps` references.
2. **Exit step fires** — the exit step's `output` takes precedence. Its keys are matched against the declared workflow output keys.
3. **No value, no exit** — outputs are matched by key name against the last executed step's output (legacy behavior).

**Use `value` on workflow outputs** to explicitly declare where each output comes from. This eliminates the need for a trailing exit step just to produce outputs. Reserve exit steps for conditional early termination.

**Step output `value`** maps fields from the raw executor result using `$result`:

```yaml
outputs:
  results:
    type: array
    value: $result.items # maps from the tool's raw response
```

This is useful when the raw executor result has a different shape than what downstream steps need. Outputs without `value` pass through from the raw result by key name.

## Expression Language

Use `$`-prefixed references to wire data between steps:

| Reference                     | Resolves To                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `$inputs.name`                | Workflow input parameter                                          |
| `$steps.<id>.output`          | A step's full output                                              |
| `$steps.<id>.output.field`    | A specific field from output                                      |
| `$item`                       | Current item in `each` or transform iteration                     |
| `$index`                      | Current index in iteration                                        |
| `$result`                     | Raw executor result (only valid in step output `value`)           |
| `$steps.<id>.output.field[0]` | First element of an array field                                   |
| `$item[$index]`               | Nested array element at computed index (only valid inside `each`) |

Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, `contains`

`contains` tests for substring or membership: `$item.title contains "Manager"` (string substring, case-insensitive); `$item.tags contains "urgent"` (array membership for primitives). Use in `transform filter` `where` clauses and `condition` guards to match text without an LLM.

Bracket indexing: `[0]`, `[$index]`, or any expression inside `[]` for array element access.

**Expression language limitations:** No function calls, no ternary expressions, no regex. Use `contains` for substring and array membership tests. Use `${}` template interpolation to build computed strings.

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

### Expression Pitfalls

| Pitfall | What happens | Correct usage |
|---------|-------------|---------------|
| `$a \|\| $b` for value coalescing | Returns `true`/`false`, not the value | `&&`/`\|\|` are boolean guards only |
| `${$inputs.query}` in template | Error — double `$` | Inside `${...}`, omit the leading `$`: `${inputs.query}` |
| `$unknown.field` | Hard error (`EvalError`) | Only valid roots: `$inputs`, `$steps`, `$item`, `$index`, `$result` |
| `$item.tags contains "urgent"` when tags is `["URGENT"]` | `false` — array `contains` is exact primitive equality, unlike string `contains` (case-insensitive) | Match the exact case stored in the array |

## Iteration Patterns

### Iterating with `each` on Tool Steps

When you need to call a tool once per item in a list, use `each` on a tool step. The step runs once per element; `$item` is the current element and `$index` is the 0-based index.

**Rate limiting:** The runtime executes iterations sequentially. **Always add `delay` to every `each` loop that calls an external service.** `delay: "1s"` waits 1 second between iterations (not after the last). External APIs rate-limit without warning; a missing `delay` is a latent failure. `delay: "2s"` is a safe default for most APIs. Always prefer a bulk API endpoint that returns all data in one request. When per-item fetching is unavoidable, add `delay`, a preceding filter step to cap the count (see the `slice_items` step in the example below), and include `retry` with `backoff`.

**Output collection:** Each iteration's output is collected into an array. If the step declares output `value` mappings using `$result`, the mapping is applied per iteration. The step record's `output` is the array of per-iteration mapped results.

**Per-iteration error handling:** With `on_error: ignore`, failed iterations produce `null` in the results array while successful iterations keep their output — the step continues through all items. The step is still marked `failed`, but the workflow continues with the partial array.

```yaml
steps:
  - id: fetch_listing
    type: tool
    tool: web_fetch
    inputs:
      url: { type: string, value: $inputs.listing_url }
    outputs:
      content: { type: string, value: $result.content }

  - id: extract_items
    type: tool
    tool: llm
    inputs:
      system: { type: string, value: "Extract a list of items from the provided content." }
      prompt: { type: string, value: "Content: ${steps.fetch_listing.output.content}\n\nReturn a JSON array of items with id and url fields." }
      schema:
        type: object
        value:
          items: { type: array }
    outputs:
      items: { type: array, value: $result.items }

  - id: fetch_details
    type: tool
    tool: web_fetch
    each: $steps.extract_items.output.items # iterate over items array
    delay: "2s" # required: rate limit between calls
    on_error: ignore # skip failed fetches, continue
    inputs:
      url:
        type: string
        value: $item.url # each item's URL from the listing
    outputs:
      content:
        type: string
        value: $result.content # mapped per iteration via $result
```

After this step, `$steps.fetch_details.output` is an array of `{ content }` objects — one per iteration. Use `$steps.fetch_details.output` (the whole array) in downstream steps or workflow outputs.

**Workflow output for each+tool:**

```yaml
outputs:
  details:
    type: array
    value: $steps.fetch_details.output # the collected array of per-iteration results
```

**Pattern: List → Slice → Fetch Details**

Full example fetching a listing then fetching each detail via `each`:

```yaml
inputs:
  listing_url:
    type: string
    default: "https://example.com/items"
  count:
    type: int
    default: 10

outputs:
  items:
    type: array
    value: $steps.fetch_details.output

steps:
  - id: fetch_listing
    type: tool
    tool: web_fetch
    inputs:
      url: { type: string, value: $inputs.listing_url }
    outputs:
      content: { type: string, value: $result.content }

  - id: extract_items
    type: tool
    tool: llm
    inputs:
      system: { type: string, value: "Extract a list of items from the provided content." }
      prompt: { type: string, value: "Content: ${steps.fetch_listing.output.content}\n\nReturn a JSON array of items with url fields." }
      schema:
        type: object
        value:
          items: { type: array }
    outputs:
      items: { type: array, value: $result.items }

  - id: slice_items
    type: transform
    operation: filter
    where: $index < $inputs.count # cap iteration count to avoid rate limiting
    inputs:
      items: { type: array, value: $steps.extract_items.output.items }
    outputs:
      items: { type: array }

  - id: fetch_details
    type: tool
    tool: web_fetch
    each: $steps.slice_items.output.items
    delay: "2s"
    retry: { max: 3, delay: "2s", backoff: 1.5 }
    on_error: ignore
    inputs:
      url: { type: string, value: $item.url }
    outputs:
      content: { type: string, value: $result.content }
```

### Pattern: Fetch → Filter → Per-Item LLM

When a workflow needs LLM-generated content for a list of items, always use per-item iteration — never pass the whole collection to the LLM in a single call.

**Why per-item is better for LLM processing:**
- **Cost** — You pay per token; one item per call uses the minimum tokens needed.
- **Quality** — The LLM focuses on one item at a time; bulk prompts produce generic output.
- **Reliability** — Bulk prompts hit context limits and produce harder-to-parse structured output.
- **Debuggability** — `on_error: ignore` skips one failed item without losing the rest.

**Pipeline:** bulk fetch → deterministic filter (free) → count cap (free) → exit guard → per-item LLM with `each`

```yaml
inputs:
  listing_url:
    type: string
    default: "https://example.com/items"
  keyword:
    type: string
    default: "engineer"
  count:
    type: int
    default: 5

outputs:
  items:
    type: array
    value: $steps.generate_descriptions.output

steps:
  - id: fetch_listing
    type: tool
    tool: web_fetch
    inputs:
      url: { type: string, value: $inputs.listing_url }
    outputs:
      content: { type: string, value: $result.content }

  - id: extract_items
    type: tool
    tool: llm
    inputs:
      system: { type: string, value: "Extract a list of items from the provided content." }
      prompt: { type: string, value: "Content: ${steps.fetch_listing.output.content}\n\nReturn a JSON array of items with title and company fields." }
      schema:
        type: object
        value:
          items: { type: array }
    outputs:
      items: { type: array, value: $result.items }

  - id: filter_relevant
    type: transform
    operation: filter
    where: $item.title contains $inputs.keyword
    inputs:
      items: { type: array, value: $steps.extract_items.output.items }
    outputs:
      items: { type: array }

  - id: cap_count
    type: transform
    operation: filter
    where: $index < $inputs.count
    inputs:
      items: { type: array, value: $steps.filter_relevant.output.items }
    outputs:
      items: { type: array }

  - id: guard_empty
    type: exit
    condition: $steps.cap_count.output.items.length == 0
    status: success
    output:
      items: []
    inputs: {}
    outputs: {}

  - id: generate_descriptions
    type: tool
    tool: llm
    each: $steps.cap_count.output.items
    delay: "500ms" # LLM calls: 500ms minimum between iterations
    retry: { max: 2, delay: "1s", backoff: 1.5 }
    on_error: ignore # skip failed items, continue with the rest
    inputs:
      system:
        type: string
        value: "You generate concise one-sentence descriptions for job listings."
      prompt:
        type: string
        value: "Describe this role in one sentence: ${item.title} at ${item.company}"
      schema:
        type: object
        value:
          description: { type: string }
    outputs:
      title: { type: string, value: $result.title }
      company: { type: string, value: $result.company }
      description: { type: string, value: $result.description }
```

**LLM step guidelines:**
- **Iterate per-item** — always use `each` on LLM steps that process a list; never bulk-prompt.
- **Use a smaller model for simple tasks** — classification, summarization, and field extraction don't need a large model.
- **Always provide `system`** — a focused system prompt improves output quality and reduces token use.
- **Keep schemas minimal** — request only the fields you actually use downstream.
- **Filter before LLM** — every item removed by a free `transform filter` saves one expensive LLM call.
- **Include `on_error: ignore`** — one failed generation should not abort the entire workflow.
- **Cap iteration count** — precede any `each` + LLM step with a `transform filter` using `$index <` to bound cost.

## Authoring Rules

1. **Use tool steps for all external calls.** Every interaction with an API, database, or LLM is a tool step. The runtime dispatches tool steps to whatever tools the host registers — the workflow author should use the exact tool names available in this deployment context. Do not invent tool names.
2. **Use transforms for pure data operations.** Filtering, reshaping, sorting, and field extraction are structural operations — use `transform` steps. Do not use tool steps to reshape data that can be expressed as a transform.
3. **Always declare inputs and outputs.** They enable validation and composability.
4. **Use `value` on workflow outputs** to explicitly map step results to workflow outputs. Use `$steps.<id>.output.<field>` expressions. This is preferred over exit steps for producing output.
5. **Use `value` on step outputs** to map fields from the raw executor result using `$result`. Useful when the tool's response shape differs from what downstream steps need.
6. **Use `each` for per-item processing** on tool steps. `delay` is mandatory for every `each` loop that calls an external service. See _Iteration Patterns_ for delay minimums, rate limiting, and retry recommendations.
7. **Add `on_error: ignore` for non-critical steps** like notifications.
8. **Add `retry` for external API calls** (tool steps that might fail transiently).
9. **Use `condition` guards for early exits** rather than letting empty data flow through.
10. **Steps execute in declaration order.** A step can only reference steps declared before it.
11. **`each` is not valid on `exit` or `conditional` steps.**
12. **`condition` on a `conditional` step is the branch condition**, not a guard.
13. **Use exit steps for conditional early termination only**, not as the default way to produce output. Exit output keys must match the declared workflow output keys.
14. **Transform steps are for arrays only.** Never use a transform to extract fields from a single object.
15. **Use `map` with `$index` for cross-array merging.** When multiple steps produce parallel arrays, use a `map` transform with bracket indexing (`$steps.other.output.field[$index]`) to zip them into structured objects.
16. **Guard expensive steps behind deterministic exits.** Pattern: fetch → filter → cap count → exit guard → expensive tool. Use deterministic expressions (e.g., `$item.department == "Engineering"` or `$item.title contains "Product Manager"`) in `transform filter` steps before any costly tool call. Every item removed by a free filter saves one expensive tool call. See _Iteration Patterns_.
17. **Prefer bulk fetch, per-item LLM.** For _data fetching_, prefer bulk endpoints that return all items in one request over per-item `each` + tool. For _LLM processing_, always use per-item `each` — never pass an entire collection to the LLM in a single call. When `each` + tool is used: `delay` is mandatory (minimum `"500ms"` for LLM, `"2s"` for external APIs), cap iteration count with a preceding `transform filter`, and add `retry` with `backoff`. See _Iteration Patterns_.
18. **Minimize LLM cost.** Checklist: (1) filter with free `transform` steps before any LLM step; (2) use the smallest available model for simple tasks (classification, summarization, extraction); (3) keep output schemas minimal — only request fields used downstream; (4) cap iteration count; (5) include `on_error: ignore` so one failure doesn't abort the workflow.

## Common Mistakes

| Mistake | Why it fails | Fix |
|---------|-------------|-----|
| Referencing a step declared later | Validation rejects forward references | Reorder steps so dependencies come first |
| Transform on a single object | Transforms operate on arrays only | Use step output `value: $result.field` to extract fields |
| `each` on exit or conditional steps | Validation rejects this | Use `each` only on tool and transform steps |
| `delay` without `each` | Validation rejects this | `delay` only applies to iteration |
| `$item`/`$index` outside iteration | Resolves to `undefined` | Only valid inside `each` or transform operations |
| Partial `retry` config | Validation fails — all three fields required | Always specify `max`, `delay`, and `backoff` together |
| `$result` in workflow output `value` | Validation rejects this | Use `$steps.<id>.output.<field>` in workflow outputs |
| `default` on a step input | Parse error — `default` is not valid on step inputs | Use `value` for step inputs; `default` is for workflow inputs only |

## Output Format

Write the SKILL.md file. The file structure:

1. YAML frontmatter (between `---` delimiters) — the very first line. The `name` field must be lowercase-hyphenated (e.g., `fetch-json-from-api`, not `Fetch JSON from API`).
2. A markdown heading.
3. A single `workflow` fenced code block containing the YAML.

Example of a complete SKILL.md:

```
---
name: example-workflow
description: Fetches a URL and returns the content
---

# Example Workflow

` `` `workflow
inputs:
  url:
    type: string
    default: "https://api.example.com/items"

outputs:
  content:
    type: string
    value: $steps.fetch.output.content

steps:
  - id: fetch
    type: tool
    tool: web_fetch
    inputs:
      url:
        type: string
        value: $inputs.url
    outputs:
      content:
        type: string
        value: $result.content
` `` `
```

## Validation

After writing the file, always validate it against the runtime. The validation checklist:

- [ ] All step IDs are unique
- [ ] All `$steps` references point to earlier steps
- [ ] All tools referenced are confirmed available in this deployment context
- [ ] Input/output types are consistent between connected steps
- [ ] No cycles in step references
- [ ] `each` not used on exit or conditional steps
- [ ] Workflow outputs have `value` mapping to `$steps` references
- [ ] Step output `value` uses `$result` (not `$steps`)
- [ ] All `${}` template references resolve to declared inputs/steps
- [ ] Every `each` loop that calls an external service has `delay` (`"500ms"` minimum for LLM, `"2s"` minimum for external APIs)
- [ ] `each` + tool steps are bounded (preceded by a cap) and have `retry` with `backoff`
- [ ] `retry` policies include all three required fields: `max`, `delay`, `backoff`
- [ ] LLM steps that process multiple items use `each` (per-item), not a single bulk prompt

If validation fails, fix the errors and revalidate.
