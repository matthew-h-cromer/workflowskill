# WorkflowSkill Examples

Real-world workflow examples with generation transcripts and run output.

## Directory Structure

Each example lives in its own subdirectory containing:

| File | Description |
|------|-------------|
| `<name>.md` | The workflow definition (SKILL.md format) |
| `transcript.txt` | The conversational `workflowskill generate` session that produced it |
| `run.json` | The JSON run log from `workflowskill run` |

## Examples

| Example | Description |
|---------|-------------|
| [fetch-and-summarize-a-job](fetch-and-summarize-a-job/) | Fetches a LinkedIn job posting and summarizes the role using an LLM |

## Usage

Validate a workflow:

```sh
npx tsx src/cli/index.ts validate examples/fetch-and-summarize-a-job/fetch-and-summarize-a-job.md
```

Run a workflow:

```sh
npx tsx src/cli/index.ts run examples/fetch-and-summarize-a-job/fetch-and-summarize-a-job.md
```
