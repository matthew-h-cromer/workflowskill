# Spec Section Map

Read the relevant section in `SPEC.md` (or `EXAMPLES.md` for workflow examples) before modifying the corresponding module.

| Spec Section | Relevant Module |
| --- | --- |
| Context (definitions) | types |
| Proposal Requirements, Authoring Model | generator |
| WorkflowSkill (YAML structure, step fields) | types, parser |
| Backwards Compatibility | parser |
| Workflow Inputs and Outputs, Step Inputs and Outputs | types, parser, runtime |
| Expression Language (incl. `$output` reference) | expression |
| Step Types (tool, llm, transform, conditional, exit) | types, executor |
| Runtime > Execution Model (two phases, 8-step lifecycle) | runtime |
| Runtime > Step Executors | executor |
| Runtime > Error Handling (on_error, retry) | runtime, executor |
| Runtime > Run Log | runtime |
| Runtime > Runtime Boundaries | runtime, adapters |
| Runtime > Conformance | validator, runtime |
| Example 1: Daily Email Triage (`EXAMPLES.md`) | test/integration/graduation |
| Example 2: Deployment Report (`EXAMPLES.md`) | test/integration/graduation |
| Example 3: Content Moderation (`EXAMPLES.md`) | test/integration/graduation |
