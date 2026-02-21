// CLI: run command — execute a workflow and print the run log.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseSkillMd, parseWorkflowFromMd } from '../parser/index.js';
import { ParseError } from '../parser/index.js';
import { runWorkflow, WorkflowExecutionError } from '../runtime/index.js';
import { MockToolAdapter } from '../adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../adapters/mock-llm-adapter.js';

export async function runCommand(
  file: string,
  options: { input?: string },
): Promise<void> {
  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file "${file}"`);
    process.exit(1);
  }

  // Parse
  let workflow;
  let workflowName = basename(file, '.md');
  try {
    // Try full SKILL.md first (with frontmatter)
    const skill = parseSkillMd(content);
    workflow = skill.workflow;
    workflowName = skill.frontmatter.name;
  } catch {
    try {
      workflow = parseWorkflowFromMd(content);
    } catch (err) {
      if (err instanceof ParseError) {
        console.error('Parse errors:');
        for (const detail of err.details) {
          console.error(`  ${detail.path}: ${detail.message}`);
        }
      } else {
        console.error(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  }

  // Parse inputs
  let inputs: Record<string, unknown> = {};
  if (options.input) {
    try {
      inputs = JSON.parse(options.input) as Record<string, unknown>;
    } catch {
      console.error('Error: --input must be valid JSON');
      process.exit(1);
    }
  }

  // Run with mock adapters (real adapters require platform integration)
  const toolAdapter = new MockToolAdapter();
  const llmAdapter = new MockLLMAdapter();

  // Register stub tools that echo their inputs
  for (const step of workflow.steps) {
    if (step.type === 'tool' && !toolAdapter.has(step.tool)) {
      toolAdapter.register(step.tool, (args) => ({
        output: args,
      }));
    }
  }

  try {
    const log = await runWorkflow({
      workflow,
      inputs,
      toolAdapter,
      llmAdapter,
      workflowName,
    });

    console.log(JSON.stringify(log, null, 2));
    process.exit(log.status === 'success' ? 0 : 1);
  } catch (err) {
    if (err instanceof WorkflowExecutionError) {
      console.error(`Workflow error: ${err.message}`);
      if (err.validationErrors) {
        for (const ve of err.validationErrors) {
          console.error(`  ${ve.path}: ${ve.message}`);
        }
      }
    } else {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}
