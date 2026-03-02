// CLI: run command — execute a workflow and print the run log.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runWorkflowSkill } from '../runtime/index.js';
import type { RunLog } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { AnthropicLLMAdapter } from '../adapters/anthropic-llm-adapter.js';
import { BuiltinToolAdapter } from '../tools/builtin-tool-adapter.js';
import type { LLMAdapter, LLMResult } from '../types/index.js';
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
  const logDir = options.logDir ?? 'runs';
  const workflowName = basename(file, '.md');

  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch (err) {
    console.error(`Error: Cannot read file "${file}": ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
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
  const toolAdapter = await BuiltinToolAdapter.create();
  let llmAdapter: LLMAdapter;
  if (config.anthropicApiKey) {
    llmAdapter = new AnthropicLLMAdapter(config.anthropicApiKey);
  } else {
    // No API key — create an adapter that fails with a clear error on first use.
    // Workflows without LLM steps (e.g., hello-world.md) still work.
    llmAdapter = {
      call(): Promise<LLMResult> {
        throw new Error(
          'ANTHROPIC_API_KEY not set. This workflow has LLM steps that require it.\n' +
          'Set it in runtime/.env or export it in your shell: export ANTHROPIC_API_KEY=sk-ant-...',
        );
      },
    };
  }

  const log = await runWorkflowSkill({
    content,
    inputs,
    toolAdapter,
    llmAdapter,
    workflowName,
    onEvent: renderRuntimeEvent,
  });

  writeRunLog(log, logDir);
  process.exit(log.status === 'success' ? 0 : 1);
}
