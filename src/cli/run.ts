// CLI: run command — execute a workflow and print the run log.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseSkillMd, parseWorkflowFromMd } from '../parser/index.js';
import { ParseError } from '../parser/index.js';
import { runWorkflow, buildFailedRunLog } from '../runtime/index.js';
import type { RunLog } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { AnthropicLLMAdapter } from '../adapters/anthropic-llm-adapter.js';
import { BuiltinToolAdapter } from '../adapters/builtin-tool-adapter.js';
import { MockToolAdapter } from '../adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../adapters/mock-llm-adapter.js';
import { renderRuntimeEvent } from './format.js';

/** Write a run log to stdout and persist it to disk. */
function writeRunLog(log: RunLog, logDir: string): void {
  const json = JSON.stringify(log, null, 2);
  mkdirSync(logDir, { recursive: true });
  const safeTimestamp = log.started_at.replace(/:/g, '-');
  const logFile = join(logDir, `${log.workflow}-${safeTimestamp}.json`);
  writeFileSync(logFile, json + '\n', 'utf-8');
  console.error(`Run log written to ${logFile}`);
  console.log(json);
}

export async function runCommand(
  file: string,
  options: { input?: string; logDir?: string },
): Promise<void> {
  const startedAt = new Date();
  const logDir = options.logDir ?? 'runs';
  const workflowName = basename(file, '.md');

  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch (err) {
    const message = `Cannot read file "${file}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(`Error: ${message}`);
    const log = buildFailedRunLog(workflowName, { phase: 'parse', message }, startedAt);
    writeRunLog(log, logDir);
    process.exit(1);
  }

  // Parse
  let workflow;
  let resolvedName = workflowName;
  try {
    // Try full SKILL.md first (with frontmatter)
    const skill = parseSkillMd(content);
    workflow = skill.workflow;
    resolvedName = skill.frontmatter.name;
  } catch {
    try {
      workflow = parseWorkflowFromMd(content);
    } catch (err) {
      let message: string;
      let details: Array<{ path: string; message: string }> | undefined;
      if (err instanceof ParseError) {
        message = err.message;
        details = err.details.length > 0 ? err.details : undefined;
        console.error(`Parse error: ${message}`);
        for (const detail of err.details) {
          console.error(`  ${detail.path}: ${detail.message}`);
        }
      } else {
        message = err instanceof Error ? err.message : String(err);
        console.error(`Parse error: ${message}`);
      }
      const log = buildFailedRunLog(workflowName, { phase: 'parse', message, details }, startedAt);
      writeRunLog(log, logDir);
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

  // Load config and create adapters
  const config = loadConfig();
  let toolAdapter;
  let llmAdapter;

  if (config.anthropicApiKey) {
    llmAdapter = new AnthropicLLMAdapter(config.anthropicApiKey);
    toolAdapter = await BuiltinToolAdapter.create(config);

    // Warn if workflow uses Google tools but no creds
    if (!config.googleCredentials) {
      const googleTools = workflow.steps
        .filter((s) => s.type === 'tool' && (s.tool.startsWith('gmail.') || s.tool.startsWith('sheets.')))
        .map((s) => (s as { tool: string }).tool);
      if (googleTools.length > 0) {
        console.warn(`Warning: Workflow uses ${googleTools.join(', ')} but no Google credentials configured`);
      }
    }

    // Register stub handlers for any tools not covered by built-in adapter
    // (so unknown tools echo their inputs instead of failing)
  } else {
    // Fallback to mock adapters when no API key is set
    const mockTool = new MockToolAdapter();
    const mockLlm = new MockLLMAdapter();

    for (const step of workflow.steps) {
      if (step.type === 'tool' && !mockTool.has(step.tool)) {
        mockTool.register(step.tool, (args) => ({
          output: args,
        }));
      }
    }

    toolAdapter = mockTool;
    llmAdapter = mockLlm;
    console.warn('Warning: No ANTHROPIC_API_KEY set — running with mock adapters');
  }

  try {
    const log = await runWorkflow({
      workflow,
      inputs,
      toolAdapter,
      llmAdapter,
      workflowName: resolvedName,
      onEvent: renderRuntimeEvent,
    });

    // Persist run log to disk (platform responsibility per spec Runtime Boundaries)
    writeRunLog(log, logDir);
    process.exit(log.status === 'success' ? 0 : 1);
  } catch (err) {
    // Truly unexpected runtime error (not a validation failure — those now return RunLog)
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unexpected error: ${message}`);
    const log = buildFailedRunLog(resolvedName, { phase: 'execute', message }, startedAt);
    writeRunLog(log, logDir);
    process.exit(1);
  }
}
