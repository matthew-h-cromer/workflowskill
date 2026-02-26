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

| Example | Description | Requires |
|---------|-------------|----------|
| [hello-world](hello-world/) | Returns "Hello, world!" | Nothing |
| [fetch-job-postings](fetch-job-postings/) | Fetches job postings from LinkedIn and extracts structured data | Nothing |
| [hello-world-gmail](hello-world-gmail/) | Sends a Hello World email to a provided address | Google OAuth2 |

## Usage

Run from the `runtime/` directory.

**Zero-config (no API key needed):**

```sh
workflowskill run examples/hello-world/hello-world.md
```

**Validate a workflow:**

```sh
workflowskill validate examples/fetch-job-postings/fetch-job-postings.md
```

**Run a workflow:**

```sh
workflowskill run examples/fetch-job-postings/fetch-job-postings.md
```
