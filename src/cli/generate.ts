// CLI: generate command — generate WorkflowSkill YAML from a natural language prompt.
// Uses the Anthropic LLM adapter when API key is available, falls back to mock template.

import { writeFileSync } from 'node:fs';
import { generateWorkflow } from '../generator/index.js';
import { loadConfig } from '../config/index.js';
import { AnthropicLLMAdapter } from '../adapters/anthropic-llm-adapter.js';
import { BuiltinToolAdapter } from '../adapters/builtin-tool-adapter.js';
import { MockLLMAdapter } from '../adapters/mock-llm-adapter.js';

export async function generateCommand(
  prompt: string,
  options: { output?: string },
): Promise<void> {
  const config = loadConfig();
  let llmAdapter;
  let toolDescriptors;

  if (config.anthropicApiKey) {
    llmAdapter = new AnthropicLLMAdapter(config.anthropicApiKey);
    const toolAdapter = await BuiltinToolAdapter.create(config);
    toolDescriptors = toolAdapter.list();
  } else {
    // Fallback to mock adapter that generates a template
    console.warn('Warning: No ANTHROPIC_API_KEY set — generating template only');
    llmAdapter = new MockLLMAdapter(() => ({
      text: generateTemplate(prompt),
      tokens: { input: 0, output: 0 },
    }));
  }

  const result = await generateWorkflow({
    prompt,
    llmAdapter,
    toolDescriptors,
    maxAttempts: config.anthropicApiKey ? 3 : 1,
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
