// CLI: generate command — generate WorkflowSkill YAML from a natural language prompt.
// This is a stub that produces a template. The full implementation requires
// an LLM adapter (src/generator/) and the authoring skill (Step 9).

import { writeFileSync } from 'node:fs';

export function generateCommand(
  prompt: string,
  options: { output?: string },
): void {
  // Generate a template workflow from the prompt
  const yaml = generateTemplate(prompt);

  if (options.output) {
    try {
      writeFileSync(options.output, yaml, 'utf-8');
      console.log(`Workflow written to ${options.output}`);
    } catch {
      console.error(`Error: Cannot write to "${options.output}"`);
      process.exit(1);
    }
  } else {
    console.log(yaml);
  }
}

function generateTemplate(prompt: string): string {
  // Extract a workflow name from the prompt
  const name = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-');

  return `---
name: ${name}
description: ${prompt}
---

# ${prompt}

\`\`\`workflow
inputs:
  # TODO: Define workflow inputs
  input:
    type: string

outputs:
  # TODO: Define workflow outputs
  result:
    type: object

steps:
  # TODO: Implement workflow steps based on:
  # "${prompt}"

  - id: step_1
    type: tool
    description: First step
    tool: example_tool
    inputs:
      data:
        type: string
        source: $inputs.input
    outputs:
      result:
        type: object
\`\`\`
`;
}
