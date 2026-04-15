# Weldable Toolkit

This toolkit connects workflows to Weldable integrations. Workflows authored
here run against integration-owned mocks in-process — no network, no
credentials needed during authoring.

## Action discovery

Use the `workflowskill` CLI commands to browse the action catalog before
writing any YAML. Never assume an action exists or guess field names.

From the user's request, identify which integrations are likely involved. If
the name is uncertain, run `integrations list` first. Then call
`actions list <names>` for only those integrations — never dump the full
catalog.

```sh
# Step 1: See what integrations are available (use when integration names are uncertain)
workflowskill integrations list

# Step 2: List actions for only the integrations you need
workflowskill actions list gmail slack

# Step 3: Describe a specific action — full input/output schema
workflowskill actions describe slack.conversations_replies
workflowskill actions describe anthropic.llm
```

`actions describe` output:

```
ID          slack.conversations_replies
DESCRIPTION Fetch the replies in a Slack thread

INPUTS
  channel string*  — Channel ID or name containing the thread
  thread_ts string*  — Thread parent message timestamp
  limit number  — Maximum number of replies to return  [default: 50]

OUTPUTS
  messages array  — Array of message objects
  has_more boolean  — Whether there are more messages to fetch
```

Fields marked `*` are required. Use exact field names in `with:` and exact
output field names in downstream `steps.<id>.output.<field>` expressions.

## Action ids

Action ids follow the pattern `<integration>.<action>` — for example:
`gmail.list_messages`, `slack.post_message`, `anthropic.generate`.

Use only ids returned by `actions list`. Do not guess or abbreviate.

## `with:` args

All `with:` values support `{{ }}` template expressions:

```yaml
with:
  channel: "#general"                             # literal string
  limit: 50                                       # literal number
  thread_ts: "{{ input.thread_ts }}"             # workflow input
  text: "{{ steps.summary.output.text }}"        # prior step output
```

Use the exact field names from `actions describe` INPUTS. Weldable validates
`with:` fields against the action's declared input schema at execution time.

## Validation and self-heal

After writing the workflow, validate it:

```sh
workflowskill validate workflows/<name>.md --toolkit weldable --dry-run
```

The validator checks schema, step ids, action existence, required/unknown
`with:` args, JSONata syntax, and step references — then optionally does a
mock dry-run. Issues are printed as:

```
<severity>  <code>  <path>: <message>
```

**Self-heal loop example:**

```
$ workflowskill validate workflows/slack-thread-summary.md --toolkit weldable

error  unknown-action  steps[0].uses: Unknown action "slack.get_thread". Run `workflowskill actions list` to find available actions.
error  action-args  steps[1].with: Action "anthropic.llm" requires input "prompt" (text) but it is missing from `with:`

2 issues
```

Fix `steps[0].uses` → run `workflowskill integrations list` to confirm the
integration name, then `workflowskill actions list slack` → find
`slack.conversations_replies` → update `uses:`.

Fix `steps[1].with` → run `workflowskill actions describe anthropic.llm` →
read INPUTS → add `prompt:` to `with:`.

Re-run validate → iterate until `ok`.

## Mock execution

The `workflowskill` CLI runs workflows against integration-owned mocks
in-process. Mocks are deterministic given the same inputs — they never touch
the network or live credentials. This means:

- The authoring loop (research → write → validate → run) works fully offline
  once packages are installed.
- Mock outputs match the live output shape exactly.
- The idempotency key (derived automatically by the interpreter) is passed as
  the seed for deterministic mock output.

## Authentication

Real action calls authenticate via Nango-resolved credentials on the Action
Worker — never in the workflow itself. During mock execution, no credentials
are used. The CLI does not require `workflowskill login` for mock-only runs.
