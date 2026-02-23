# RFC Section Map

Read the relevant RFC section in `rfc-workflowskill.md` before modifying the corresponding module.

| RFC Lines | Section | Relevant Module |
| --- | --- | --- |
| 44-63 | Context (definitions) | types |
| 146-192 | Proposal requirements, Authoring Model | generator |
| 193-253 | YAML structure, step fields | types, parser |
| 256-259 | Backwards compatibility | parser |
| 260-320 | Workflow inputs/outputs, step/workflow output `source` | types, parser, runtime |
| 303-333 | Expression language (incl. `$result` reference) | expression |
| 334-401 | Step types (tool, llm, transform, conditional, exit) | types, executor |
| 402-423 | Runtime execution model (two phases, 8-step lifecycle) | runtime |
| 425-488 | Step executors | executor |
| 490-499 | Error handling (on_error, retry) | runtime, executor |
| 501-533 | Run log format | runtime |
| 535-550 | Runtime boundaries | runtime, adapters |
| 552-565 | Conformance requirements | validator, runtime |
| 567-722 | Example 1: Email triage | test/integration/graduation |
| 723-832 | Example 2: Deployment report | test/integration/graduation |
| 833-1022 | Example 3: Content moderation | test/integration/graduation |
