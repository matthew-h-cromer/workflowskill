// CLI: generate command — generate WorkflowSkill YAML from a natural language prompt.
// Uses the generator module with a mock LLM adapter (produces a template).
// With a real LLM adapter, the generator performs a validate-fix loop.

import { writeFileSync } from 'node:fs';
import { generateWorkflow } from '../generator/index.js';
import { MockLLMAdapter } from '../adapters/mock-llm-adapter.js';

export async function generateCommand(
  prompt: string,
  options: { output?: string },
): Promise<void> {
  // Use mock adapter that generates a template
  // A real integration would use the Anthropic SDK adapter
  const llmAdapter = new MockLLMAdapter(() => ({
    text: generateTemplate(prompt),
    tokens: { input: 0, output: 0 },
  }));

  const result = await generateWorkflow({
    prompt,
    llmAdapter,
    maxAttempts: 1,
  });

  const output = result.content;

  if (options.output) {
    try {
      writeFileSync(options.output, output, 'utf-8');
      console.log(`Workflow written to ${options.output}`);
      if (!result.valid) {
        console.warn('Warning: Generated workflow has validation errors:');
        for (const err of result.errors) {
          console.warn(`  ${err}`);
        }
      }
    } catch {
      console.error(`Error: Cannot write to "${options.output}"`);
      process.exit(1);
    }
  } else {
    console.log(output);
    if (!result.valid && result.errors.length > 0) {
      console.warn('\nWarning: Generated workflow has validation errors:');
      for (const err of result.errors) {
        console.warn(`  ${err}`);
      }
    }
  }
}

function generateTemplate(prompt: string): string {
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
  input:
    type: string

outputs:
  result:
    type: object

steps:
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
