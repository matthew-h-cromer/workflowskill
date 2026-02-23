// CLI: generate command — generate WorkflowSkill YAML from a natural language prompt.
// Interactive by default when API key is set and stdin is a TTY.
// Falls back to single-shot generation for non-TTY or missing API key.

import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import pc from 'picocolors';
import { generateWorkflow, generateWorkflowConversational } from '../generator/index.js';
import type { ConversationEvent } from '../generator/conversation.js';
import { renderEvent } from './format.js';
import { loadConfig } from '../config/index.js';
import { AnthropicLLMAdapter } from '../adapters/anthropic-llm-adapter.js';
import { BuiltinToolAdapter } from '../adapters/builtin-tool-adapter.js';
import { MockLLMAdapter } from '../adapters/mock-llm-adapter.js';

export async function generateCommand(
  prompt: string,
  options: { output?: string },
): Promise<void> {
  const config = loadConfig();

  // Interactive conversation when: API key available + stdin is a TTY
  if (config.anthropicApiKey && process.stdin.isTTY) {
    await generateCommandInteractive(prompt, options, config.anthropicApiKey);
  } else {
    await generateCommandSingleShot(prompt, options);
  }
}

/** Interactive conversational generation via readline. */
async function generateCommandInteractive(
  prompt: string,
  options: { output?: string },
  apiKey: string,
): Promise<void> {
  const config = loadConfig();
  const llmAdapter = new AnthropicLLMAdapter(apiKey);
  // Create tool adapter only for descriptors (so LLM knows what workflow tools exist)
  const toolAdapter = await BuiltinToolAdapter.create(config);
  const toolDescriptors = toolAdapter.list();

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // Prompts go to stderr so stdout stays clean for output
  });

  const promptStr = '\n' + pc.bold(pc.blue('❯ '));
  const getUserInput = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const lines: string[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;
      let pasteDetected = false;

      const submit = (): void => {
        rl.removeListener('line', onLine);
        const input = lines.join('\n');
        if (input.trim().toLowerCase() === '/quit') {
          resolve(null);
        } else {
          resolve(input);
        }
      };

      const onLine = (line: string): void => {
        if (pasteDetected) {
          // After paste, empty Enter submits; non-empty appends more
          if (line === '') {
            submit();
          } else {
            lines.push(line);
          }
          return;
        }

        lines.push(line);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (lines.length === 1) {
            // Single line typed normally — submit immediately
            submit();
          } else {
            // Multi-line paste detected — wait for Enter to submit
            pasteDetected = true;
            process.stderr.write(pc.dim('  (multiline paste detected — press Enter to send)\n'));
          }
        }, 50); // 50ms debounce distinguishes paste from typing
      };

      process.stderr.write(promptStr);
      rl.on('line', onLine);
    });
  };

  let fileWritten = false;

  const onEvent = (event: ConversationEvent): void => {
    if (event.type === 'workflow_generated') {
      if (options.output) {
        try {
          writeFileSync(options.output, event.content, 'utf-8');
          fileWritten = true;
          process.stderr.write(`\n  ${pc.bold(pc.green('✓'))} ${pc.green('Workflow written to')} ${pc.bold(pc.white(options.output))}\n`);
          if (!event.valid) {
            process.stderr.write(`  ${pc.yellow('⚠ Validation errors:')}\n`);
            for (const err of event.errors) {
              process.stderr.write(`    ${pc.dim('•')} ${pc.yellow(err)}\n`);
            }
          }
          process.stderr.write(`\n  ${pc.dim('Press Enter to accept, or type feedback to iterate.')}\n\n`);
        } catch {
          process.stderr.write(`\n  ${pc.red('✗')} ${pc.red(`Cannot write to "${options.output}"`)}\n\n`);
        }
      }
    } else {
      renderEvent(event);
    }
  };

  try {
    const result = await generateWorkflowConversational({
      prompt,
      llmAdapter,
      toolDescriptors,
      getUserInput,
      onEvent,
    });

    rl.close();
    // Skip file write if workflow_generated event already wrote the file
    if (fileWritten && result.valid) {
      process.stderr.write(`  ${pc.bold(pc.green('✓'))} ${pc.green('Workflow accepted:')} ${pc.bold(pc.white(options.output ?? ''))}\n\n`);
    } else {
      outputResult(result.content, result.valid, result.errors, options);
    }
  } catch (err) {
    rl.close();
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/** Single-shot generation (no API key or non-TTY). */
async function generateCommandSingleShot(
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
  });

  outputResult(result.content, result.valid, result.errors, options);
}

/** Write result to file or stdout, with validation warnings. */
function outputResult(
  content: string,
  valid: boolean,
  errors: string[],
  options: { output?: string },
): void {
  if (options.output) {
    try {
      writeFileSync(options.output, content, 'utf-8');
      console.log(`Workflow written to ${options.output}`);
      if (!valid) {
        console.warn('Warning: Generated workflow has validation errors:');
        for (const err of errors) {
          console.warn(`  ${err}`);
        }
      }
    } catch {
      console.error(`Error: Cannot write to "${options.output}"`);
      process.exit(1);
    }
  } else {
    console.log(content);
    if (!valid && errors.length > 0) {
      console.warn('\nWarning: Generated workflow has validation errors:');
      for (const err of errors) {
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
