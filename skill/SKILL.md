---
name: workflowskill-workflow-author
description: >
  Teaches Claude how to generate declarative YAML workflows in SKILL.md format
  for the WorkflowSkill engine.
---

# WorkflowSkill Workflow Author

You generate valid YAML workflows for the WorkflowSkill engine. When a user
describes what they want to automate, you produce a workflow file they can run.

The user should never have to think about workflow internals. They describe the
goal in natural language; you research, assemble, and deliver a working workflow.

## Authoring Process

### Phase 1: Understand

- Read the user's request carefully.
- If the request is ambiguous, ask 2–3 focused clarifying questions before
  proceeding.
- If the request is clear, skip directly to Research.

### Phase 2: Research

Discover available actions using the CLI before writing any YAML. **Never
guess an action id or field name.**

```sh
# List every available action (id + one-line description). Scan this once
# and pick the ids you need — no keyword search, no per-integration filter.
workflowskill actions list

# Describe a specific action: see its input fields, output fields, and preview
workflowskill actions describe <action-id>
```

`actions describe` output format:

```
ID          <id>
DESCRIPTION <description>

INPUTS
  <name> <type>[*][=<default>]  — <description>  [options: a, b, c]

OUTPUTS
  <name> <type>  — <description>
```

Fields marked `*` are required. Fields without `*` are optional and may have
a default value shown after `=`.

Use the exact `id` from `actions describe` for the step's `uses:` field. Use the
exact `name` values from INPUTS for `with:` keys. Map OUTPUTS field names to
downstream `steps.<id>.output.<field>` references.

**Stop if the task is not achievable.** If no action covers the required
capability, tell the user what is missing — do not generate a workflow that
cannot run.

### Phase 3: Assemble

Build the workflow step by step, using the field names you confirmed in Phase 2.
Map the task to primitives:

| Need | Primitive |
|---|---|
| Call an integration | `action` |
| Reshape / filter / compute | `transform` |
| Branch on a condition | `if` or `switch` |
| Iterate a collection | `foreach` |
| Poll until a condition | `while` |
| Fan out concurrently | `parallel` |
| Tolerate a failing action | `continue_on_error: true` on the action |
| Group recovery / cleanup | `try` / `catch` / `finally` |
| Delay | `wait` |
| Wait for an inbound event | `wait_for_signal` |
| Exit early with a value | `return` |

Keep workflows as deterministic as possible. Reach for an LLM action only when
the task genuinely requires inference — classifying free text, summarizing,
generating natural language, translating. Everything else is a deterministic
operation with a non-LLM answer.

**Not inference — do not use an LLM:**

| Task | Use instead |
|---|---|
| Parse HTML into fields | `web.scrape` with CSS selectors |
| Extract links, titles, prices from a page | `web.scrape` with `extract: "href"` / `"text"` |
| Reshape, rename, or filter data | `transform` with JSONata |
| Deduplicate, count, join arrays | `transform` with JSONata (`$reduce`, `$filter`) |
| Format a date or number | `transform` with JSONata (`$fromMillis`, `$string`) |
| Pick the right API field | Read the action's OUTPUTS with `actions describe` |
| Parse JSON from a response | `transform` — JSON is already parsed when the action returns |

Before adding an `anthropic.llm` step, write one sentence naming the inference:
*"classify this message as urgent/normal/spam"*, *"summarize this thread in two
sentences"*, *"translate this to French"*. If the sentence contains *"parse"*,
*"extract"*, *"pick"*, *"convert"*, *"reformat"*, or *"reshape"*, the step is
deterministic — delete it and find the right action or transform.

**When calling an LLM over a list, one item per call — never batch.** Batching
makes each result non-retryable, allows items to contaminate each other's
output, and degrades reliability at scale.

### Phase 4: Validate & Self-Heal

Run the validator and iterate until it exits clean.

```sh
workflowskill validate workflows/<name>.md --toolkit weldable --dry-run
```

The validator runs a pipeline of checks and reports issues in this format:

```
<severity>  <code>  <path>: <message>
```

**Issue codes and how to fix them:**

| Code | Meaning | Fix |
|---|---|---|
| `schema` | Invalid YAML structure or missing required field | Fix the YAML shape |
| `semantic` | Duplicate step id or outer-scope shadowing | Rename the conflicting id |
| `unknown-action` | `uses:` value not in the toolkit | Run `actions list` to find the right id |
| `action-args` | Missing required input, unknown key, or wrong type in `with:` | Run `actions describe <id>` and align `with:` to INPUTS |
| `jsonata-syntax` | JSONata expression won't parse | Fix the expression syntax |
| `unknown-step-ref` | `steps.<id>` references a step not yet in scope | Check step ordering and nesting |
| `dry-run` | Workflow threw at runtime (control-flow or expression error) | Inspect the message and fix the step |

Repeat the edit → validate cycle until the command prints `ok` (exit 0). Then
run a smoke test:

```sh
workflowskill run workflows/<name>.md --toolkit weldable
```

---

## Workflow File Format

Every workflow lives in a `.workflow.md` file. The file has two parts:

1. **YAML frontmatter** between `---` delimiters — the complete workflow definition.
2. **Markdown body** after the closing `---` — a plain-language description of the workflow.

```
---
version: 1
name: my-workflow
description: "One-sentence benefit statement written as advertising copy."
inputs:
  query:
    type: string
    default: "hello"
    description: "What to search for"
outputs:
  result: "{{ steps.final.output }}"
steps:
  - id: final
    description: Combine query with world to form the result
    type: transform
    expr: "input.query & ' world'"
---

Combines an input query string with the word "world" and returns the result.
Use this workflow to demonstrate the simplest possible data transformation.
```

The markdown body is for humans — describe what the workflow does, what
integrations it uses, when to run it, and any manual setup needed. Never
put YAML in the body; the frontmatter is the single source of truth.

### Frontmatter fields

| Field | Required | Notes |
|---|---|---|
| `version` | yes | Always `1` |
| `name` | yes | Lowercase letters, numbers, and hyphens only (max 64 chars). Cannot contain the reserved words `anthropic` or `claude`. Follows the [Agent Skills](https://agentskills.io) `name` rule. |
| `description` | yes | One persuasive sentence describing the benefit to the user — not the implementation. Max 1024 chars (Agent Skills `description` rule). |
| `inputs` | no | Declared inputs; each has `type`, optional `default`, optional `description` |
| `outputs` | no | Map of `name: "{{ expr }}"` — workflow return value. Alternative: a `return` step |
| `steps` | yes | Sequential list of step objects |

Always double-quote the `description` value to avoid YAML parsing issues with
special characters.

### Step ids and descriptions

Every step requires both an `id` and a `description` — no exceptions.

- **`id`** — short `snake_case` identifier, unique among siblings. Used in logs,
  traces, and to reference output as `steps.<id>.output`.
- **`description`** — single line, 80 characters or fewer, imperative voice from
  the user's perspective.

```yaml
- id: messages
  description: Reshape messages into triage records
  type: transform
  expr: "..."
```

The `description` appears in the step inspector and workflow run logs. Write it so someone unfamiliar with the implementation immediately
understands what the step does. Do not use `# comments` above steps.

**Conventions by step type** (soft guidance — write the most natural phrasing):

| Step | Convention | Example |
|---|---|---|
| `action` | Imperative verb phrase | `Fetch unread Gmail messages` |
| `transform` | Imperative verb phrase | `Reshape messages into triage records` |
| `if` | Starts with `If …` | `If inbox is empty, return early` |
| `switch` | Starts with `Depending on …` / `Based on …` | `Depending on urgency, route the alert` |
| `foreach` | Starts with `For each …` | `For each message, classify urgency` |
| `while` | Starts with `While …` / `Until …` | `Until the job finishes, poll status` |
| `parallel` | Starts with `In parallel, …` | `In parallel, notify Slack and log metrics` |
| `try` | Imperative verb phrase | `Post to Slack with error recovery` |
| `wait` | Starts with `Wait …` | `Wait 30 seconds before retrying` |
| `wait_for_signal` | Starts with `Wait for …` | `Wait for the webhook to arrive` |
| `return` | Starts with `Return …` | `Return empty-inbox result` |

---

## Expression Language

Everything is **JSONata**. One language, two surface forms:

**Bare expression** (the whole field IS the expression, no delimiters):
- `transform.expr`
- `if.when`, `while.when`, `switch.on` — predicates; truthy result selects the branch

```yaml
- id: filtered
  type: transform
  expr: "input.items[value > 2].label"

- id: check
  type: if
  when: "$count(steps.urgent.output) >= input.threshold"
```

**Template form** (`{{ }}` spans inside a string) — used in every other string-typed field:
```yaml
with:
  email: "{{ input.email }}"
  subject: "{{ steps.draft.output.subject }}"
```

A string that is entirely one `{{ expr }}` span returns the raw evaluated value
(object/array/number/boolean); strings with surrounding text are coerced to string.

### Common JSONata patterns

**Filter and iterate safely — always append `[]`**

`$filter`, `$sift`, `$sort`, `$map`, `$distinct`, and path expressions all collapse a single result to a scalar instead of a one-element array. Any `foreach.items` or action arg typed `array` must receive an array. Append `[]` to force array shape:

```yaml
# BAD — $filter returns a scalar when exactly one message matches; foreach throws
items: "{{ $filter(steps.fetch.output.messages, function($m){ $m.urgent }) }}"

# GOOD — [] forces array shape even on a single match
items: "{{ $filter(steps.fetch.output.messages, function($m){ $m.urgent })[] }}"
```

Use the same pattern in `transform.expr` when the result feeds an array slot:

```
$filter(steps.results.output, function($r){ $r.score > 0.8 })[]
```

**Map/reshape an array**

```
steps.items.output.{ "id": id, "label": name }
```

**Reduce to a scalar**

```
$reduce(steps.scores.output, function($acc, $v){ $acc + $v }, 0)
```

**Safe navigation (null-forgiving)**

JSONata path navigation returns `undefined` (not an error) when a field is missing — no optional-chaining needed:

```
steps.search.output.results[0].title    /* undefined if missing, never throws */
```

**Count / check existence**

```
$count(steps.list.output) > 0          /* true if list is non-empty */
$exists(steps.step_id.output.field)    /* true if field is present */
$not($exists(x))                       /* true if field is absent */
```

**String interpolation vs. bare expressions**

- `{{ expr }}` in string fields (action args, `return.value`, `wait_for_signal.match`) — always wrap in braces
- Bare expression (no braces) in `transform.expr`, `if.when`, `while.when`, `switch.on` — never use `{{ }}`

### JSONata gotchas (vs. other languages)

```
=    equality              NOT ==
!=   inequality
and  boolean and           NOT && or `AND`
or   boolean or            NOT ||
$count(arr)                array length (not size() or len())
$not($exists(x))           checks whether a path is missing
x = null                   checks whether a value is explicitly null
```

### Execution context

Every expression can reference:

```
steps.<id>.output          — output of a completed step
steps.<id>.error           — error (only inside catch)
input.<name>               — workflow inputs
workflow.run_id            — current run id
workflow.owner             — publisher / runner identity
workflow.name              — workflow name
workflow.started_at        — ISO timestamp
env.<name>                 — publisher-scoped env vars (never process.env)
```

Inside a `foreach` body, `<as>` (the loop variable) and `$index` are also in scope.
Inside a `catch` block, `error` is in scope.

### JSONata quick reference

```
&            string concatenation: "Hello, " & input.name
$count(arr)  array length
$string(x)   coerce to string
$number(x)   coerce to number
arr[cond]    filter array: input.items[value > 2]
obj.field    field access: steps.lookup.output.email
[1, 2, 3]   array literal
{"k": v}    object literal
x = null     explicit null check
$not($exists(x))  missing-path check
```

---

## Step Primitives

### `action` — call an integration

```yaml
- id: list_unread
  type: action
  uses: gmail.search
  with:
    q: "is:unread newer_than:1d"
    maxResults: 50
```

Step-level options (on `action` only):
```yaml
  retry:
    max_attempts: 3
    backoff: exponential       # | linear | fixed
  timeout: "30s"
  continue_on_error: true      # default false
```

### `transform` — reshape data with JSONata

```yaml
- id: urgent
  type: transform
  expr: |
    steps.list_unread.output.messages[
      "IMPORTANT" in labelIds
    ].{
      id: id,
      subject: headers.subject,
      from: headers.from
    }
```

`expr` is a bare JSONata expression (no `{{ }}`). The result is the step's output.

### `if` — conditional branch

```yaml
- id: check
  type: if
  when: "$count(steps.urgent.output) >= input.threshold"
  then:
    - id: notify
      type: action
      uses: slack.post_message
      with:
        channel: "#alerts"
        text: "{{ $string($count(steps.urgent.output)) & ' urgent emails' }}"
  else:              # optional
    - id: done
      type: return
      value: '{{ {"status": "no_alerts"} }}'
```

`when` is a bare JSONata expression (no `{{ }}`); any truthy result takes the
`then` branch. Inner steps from the chosen branch are accessible outside by
their `id`.

### `switch` — multi-way branch

```yaml
- id: route
  type: switch
  on: "steps.classify.output.category"
  cases:
    billing:
      - id: label
        type: transform
        expr: "'Billing issue'"
    support:
      - id: label
        type: transform
        expr: "'Support request'"
  default:
    - id: label
      type: transform
      expr: "'General inquiry'"
outputs:
  category: "{{ steps.label.output }}"
```

`on` is a bare JSONata expression; its result is coerced to string and matched
against `cases`. If no case matches, `default` runs.

### `foreach` — iterate a collection

```yaml
- id: enrich
  type: foreach
  items: "{{ steps.urgent.output }}"
  as: msg
  concurrency: 5            # optional, default unlimited
  rate_limit:               # optional
    max: 10
    per: "1s"               # "1s" | "1m" | "1h"
  body:
    - id: lookup
      type: action
      uses: clearbit.person_lookup
      with:
        email: "{{ msg.from }}"
```

The loop variable (`msg`) and `$index` are in scope inside `body`.
Body step ids must not shadow any outer scope id.

#### `foreach` output shape

Unlike `if` / `while` / `switch` (whose bodies write to the outer scope),
`foreach` scopes each iteration separately. `steps.<foreach_id>.output` is an
**array of per-iteration scopes**, where each element exposes its inner step
ids:

```
steps.enrich.output = [
  { lookup: { output: {...} } },   // iteration 0
  { lookup: { output: {...} } },   // iteration 1
  ...
]
```

So iteration results live *inside* each array element, not alongside the array.

**Access one iteration by index:**
```jsonata
steps.enrich.output[0].lookup.output
```

**Project a field across every iteration:**
```jsonata
steps.enrich.output.lookup.output.email
```

**Filter iterations by a nested result** (pattern from `examples/gmail-triage.md`):
```jsonata
steps.classified.output[triage.output.urgency = 'urgent']
```
— reads "every iteration scope whose inner `triage` step classified the
message as urgent."

### `while` — conditional loop

```yaml
- id: poll
  type: while
  when: "steps.check.output.status != 'done'"
  max_iterations: 60        # required
  rate_limit:               # optional
    max: 1
    per: "1m"
  body:
    - id: check
      type: action
      uses: job.get_status
      with:
        job_id: "{{ input.job_id }}"
```

`max_iterations` is required as a safety cap. `when` is a bare JSONata
predicate, re-evaluated before each iteration. Body steps are written to the
outer scope, so `steps.check.output` is accessible after the loop.

### `parallel` — concurrent named branches

```yaml
- id: lookup
  type: parallel
  branches:
    clearbit:
      - id: person
        type: action
        uses: clearbit.person
        with: { email: "{{ input.email }}" }
    hubspot:
      - id: contact
        type: action
        uses: hubspot.contact_by_email
        with: { email: "{{ input.email }}" }
```

Access branch results: `steps.lookup.branches.clearbit.person.output`

### `try` / `catch` / `finally` — error handling

**Reach for `try` only when at least one applies:**
- **Group scope.** A sequence of steps should be treated as a unit — if any of them fails, stop the group and run recovery.
- **`finally` cleanup.** A block must run regardless of success or failure (release a lock, close a session, record an audit event).
- **Real recovery.** `catch` runs alternate *actions* — call a fallback API, open an incident, escalate to a human — not just reshape an error into a result object.

**For a single fallible action, prefer `continue_on_error: true`** and check `steps.<id>.error` downstream. It is less nesting and the spec's intended idiom for tolerated failures.

**For transient failures, prefer `retry` on the `action` step.** `try` is not a retry mechanism.

```yaml
- id: risky_sync
  type: try
  body:
    - id: sync
      type: action
      uses: external.sync
  catch:
    - id: alert
      type: action
      uses: slack.post_message
      with:
        channel: "#ops"
        text: "{{ 'Sync failed: ' & error.message }}"
  finally:           # optional, always runs
    - description: Record that the sync attempt ran
      type: action
      uses: audit.record
      with:
        event: "sync_attempted"
```

Inside `catch`, `error` is in scope: `{ message, code, step_id, retryable, details }`.

`steps.<try_id>.output` resolves to the last step output of whichever branch
ran — the `body`'s last step on success, or the `catch`'s last step on
recovery. Downstream code can reference `steps.<try_id>.output` without
caring which path executed. Use meaningful distinct ids inside `body` and
`catch` rather than shadowing a single id across both.

### `wait` — time-based suspension

```yaml
# Wait a fixed duration
- id: pause
  description: Pause for 5 minutes before proceeding
  type: wait
  duration: "5m"

# Wait until a specific time
- id: wait_until_scheduled
  description: Pause until the scheduled start time
  type: wait
  until: "{{ input.scheduled_at }}"
```

Exactly one of `duration` or `until` is required.

### `wait_for_signal` — external event resume

```yaml
- id: payment
  type: wait_for_signal
  signal: "stripe.payment_succeeded"
  match:
    "customer.email": "{{ input.email }}"   # optional filter
  timeout: "7d"
  on_timeout: abort          # | continue
```

On receive: output is the signal payload.
On `on_timeout: continue`: output is `null`.
On `on_timeout: abort`: throws `WorkflowError{ code: "timeout" }`.

### `return` — explicit early exit

```yaml
- id: skip_result
  description: Return a skipped status if no items were found
  type: return
  value: '{{ {"status": "skipped", "reason": "no items"} }}'
```

Stops execution and returns the evaluated value as the workflow output.
Use this for early exits from conditional branches. For the normal final output,
prefer top-level `outputs:` instead.

---

## Scoping Rules

Step ids must be unique among siblings (same nesting level).
Shadowing an outer id in a nested body is a **validation error** — use a
different name.

`foreach` and `parallel` push a new scope for each iteration/branch.
Body steps write to the inner scope; outer steps are readable but not writable.
`while` and `if`/`switch` bodies share the parent scope — their inner steps
are directly visible as `steps.<id>` from outside.

---

## Common Patterns

### Pure transform (no actions)

```yaml
version: 1
name: format-greeting
description: "Returns a personalized greeting."
inputs:
  name:
    type: string
    default: World
outputs:
  greeting: "{{ steps.greet.output }}"
steps:
  - id: greet
    description: Build the personalized greeting string
    type: transform
    expr: "'Hello, ' & input.name & '!'"
```

### Sequential pipeline

```yaml
steps:
  - id: raw
    description: Fetch unread Gmail messages
    type: action
    uses: gmail.search
    with: { q: "is:unread" }

  - id: messages
    description: Reshape to just the fields we need
    type: transform
    expr: "steps.raw.output.messages.{ id: id, subject: headers.subject }"

  - id: processed
    description: For each message, classify its urgency
    type: foreach
    items: "{{ steps.messages.output }}"
    as: msg
    concurrency: 3
    body:
      - id: triage
        description: Classify this message as urgent, normal, or spam
        type: action
        uses: anthropic.classify
        with:
          text: "{{ msg.subject }}"
          categories: ["urgent", "normal", "spam"]
```

### Conditional early exit

```yaml
steps:
  - id: items
    description: Fetch items matching the filter
    type: action
    uses: api.list_items
    with: { filter: "{{ input.filter }}" }

  - id: check_empty
    description: If no items found, return empty result immediately
    type: if
    when: "$count(steps.items.output.results) = 0"
    then:
      - id: return_empty
        description: Return empty result
        type: return
        value: '{{ {"status": "empty", "count": 0} }}'

  - id: process
    description: Process the batch of matched items
    type: action
    uses: api.process_batch
    with: { ids: "{{ steps.items.output.results.id }}" }

outputs:
  status: "done"
  count: "{{ $count(steps.items.output.results) }}"
```

### Error recovery

```yaml
steps:
  - id: sync_attempt
    description: Sync CRM records with retry and error fallback
    type: try
    body:
      - id: result
        description: Sync records to the CRM
        type: action
        uses: crm.sync
        with: { records: "{{ input.records }}" }
        retry:
          max_attempts: 3
          backoff: exponential
    catch:
      - id: result
        description: Return failure summary on sync error
        type: transform
        expr: '{"synced": 0, "error": error.message}'

outputs:
  result: "{{ steps.result.output }}"
```

### Poll until complete

```yaml
steps:
  - id: job
    description: Start the batch job
    type: action
    uses: batch.start
    with: { payload: "{{ input.data }}" }

  - id: poll
    description: Until job is complete, poll status every 30 seconds
    type: while
    when: "steps.status.output.state != 'complete'"
    max_iterations: 20
    rate_limit:
      max: 1
      per: "30s"
    body:
      - id: status
        description: Fetch the current job status
        type: action
        uses: batch.get_status
        with: { job_id: "{{ steps.job.output.id }}" }

outputs:
  result: "{{ steps.status.output.result }}"
```

### Wait for inbound webhook

```yaml
steps:
  - id: order
    description: Create the order in Shopify
    type: action
    uses: shopify.create_order
    with: { items: "{{ input.items }}" }

  - id: payment
    description: Wait for the Stripe payment webhook, up to 2 hours
    type: wait_for_signal
    signal: "stripe.payment_succeeded"
    match:
      "metadata.order_id": "{{ steps.order.output.id }}"
    timeout: "2h"
    on_timeout: continue

  - id: check_payment
    description: If payment timed out, return unpaid status
    type: if
    when: "steps.payment.output == null"
    then:
      - id: return_unpaid
        description: Return unpaid result
        type: return
        value: '{{ {"status": "unpaid"} }}'

  - id: fulfil
    description: Fulfil the order now that payment is confirmed
    type: action
    uses: shopify.fulfil_order
    with: { order_id: "{{ steps.order.output.id }}" }

outputs:
  status: "fulfilled"
```

---

## Design Constraints

- **No arbitrary code.** JSONata handles all data reshaping and predicates.
  If a transformation can't be expressed in either, expose the missing capability
  as an integration action — don't try to embed code.
- **No `process.env`.** `env.*` is never ambient environment. It's populated
  by the publisher's allowlisted secrets system on hosted runtimes.
- **Idempotency is automatic.** The interpreter derives a deterministic key from
  `run_id + step_path + iteration + branch` and passes it to every action call.
  You don't declare idempotency keys for within-run retries. For business-level
  dedup (e.g. "send this invoice exactly once ever"), use the integration's
  native argument in `with:`.
- **Don't edit running workflows.** Structural YAML edits invalidate in-progress
  runs on replay-based runtimes. Edits produce new workflow versions; mid-run
  upgrades are not supported.
- **`retry` on `action` steps only.** Retry on deterministic steps (`transform`,
  `if`, `switch`, `while`, `foreach`, `parallel`, `try`) is meaningless and
  rejected by the schema.
