#!/usr/bin/env node
// WorkflowSkill CLI — run workflow files from the command line.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { runWorkflowSkill } from 'workflowskill';
import { CliToolAdapter } from './adapter.js';
import { createEventHandler } from './display.js';

/**
 * Load a .env file from the given directory and merge into process.env.
 * Existing env vars take precedence — .env only fills gaps.
 * Supports KEY=VALUE format, blank lines, and # comments.
 * Values may be quoted with single or double quotes.
 */
function loadDotenv(dir: string): void {
  const envPath = join(dir, '.env');
  if (!existsSync(envPath)) return;
  let content: string;
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const USAGE = `
Usage: workflowskill run <file> [options]

Options:
  -i, --input key=value   Set a workflow input (repeatable)
  --json-input '{...}'    Set all inputs as a JSON object
  --output-json           Print the full RunLog as JSON to stdout
  -h, --help              Show this help message

Examples:
  workflowskill run examples/hello-world.md
  workflowskill run my-workflow.md -i url=https://example.com
  workflowskill run my-workflow.md --json-input '{"url":"https://example.com"}'
  workflowskill run my-workflow.md --output-json
`.trim();

function parseArgs(argv: string[]): {
  file: string;
  inputs: Record<string, string>;
  jsonInput: string | undefined;
  outputJson: boolean;
} | null {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return null;
  }

  if (args[0] !== 'run') {
    console.error(`Unknown command: ${args[0]}`);
    return null;
  }

  if (!args[1] || args[1].startsWith('-')) {
    console.error('workflowskill run: <file> argument is required');
    return null;
  }

  const file = args[1];
  const inputs: Record<string, string> = {};
  let jsonInput: string | undefined;
  let outputJson = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '-i' || arg === '--input') {
      const pair = args[++i];
      if (!pair) {
        console.error(`${arg} requires a key=value argument`);
        return null;
      }
      const eq = pair.indexOf('=');
      if (eq === -1) {
        console.error(`Invalid input "${pair}" — expected key=value`);
        return null;
      }
      inputs[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === '--json-input') {
      jsonInput = args[++i];
      if (!jsonInput) {
        console.error('--json-input requires a JSON string argument');
        return null;
      }
    } else if (arg === '--output-json') {
      outputJson = true;
    } else if (arg === '--help' || arg === '-h') {
      return null;
    } else {
      console.error(`Unknown option: ${arg}`);
      return null;
    }
  }

  return { file, inputs, jsonInput, outputJson };
}

async function main(): Promise<void> {
  loadDotenv(process.cwd());

  const parsed = parseArgs(process.argv);

  if (!parsed) {
    console.log(USAGE);
    process.exit(0);
  }

  const { file, inputs, jsonInput, outputJson } = parsed;

  // Merge inputs: --json-input takes precedence, then --input pairs
  let mergedInputs: Record<string, unknown> = { ...inputs };
  if (jsonInput) {
    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(jsonInput);
    } catch {
      console.error(`--json-input: invalid JSON: ${jsonInput}`);
      process.exit(1);
    }
    if (typeof jsonParsed !== 'object' || jsonParsed === null || Array.isArray(jsonParsed)) {
      console.error('--json-input: must be a JSON object');
      process.exit(1);
    }
    mergedInputs = { ...mergedInputs, ...(jsonParsed as Record<string, unknown>) };
  }

  // Read file
  let content: string;
  try {
    content = readFileSync(resolve(file), 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Cannot read file "${file}": ${msg}`);
    process.exit(1);
  }

  const adapter = new CliToolAdapter();
  const onEvent = outputJson ? undefined : createEventHandler();

  const runLog = await runWorkflowSkill({
    content,
    inputs: mergedInputs,
    toolAdapter: adapter,
    workflowName: basename(file, extname(file)),
    onEvent,
  });

  if (outputJson) {
    console.log(JSON.stringify(runLog, null, 2));
    process.exit(runLog.status === 'success' ? 0 : 1);
  }

  if (runLog.status === 'success') {
    if (Object.keys(runLog.outputs).length > 0) {
      console.log(JSON.stringify(runLog.outputs, null, 2));
    }
    process.exit(0);
  } else {
    if (runLog.error) {
      console.error(`Error [${runLog.error.phase}]: ${runLog.error.message}`);
      if (runLog.error.details) {
        for (const d of runLog.error.details) {
          console.error(`  ${d.path}: ${d.message}`);
        }
      }
    } else {
      const failed = runLog.steps.filter((s) => s.status === 'failed');
      for (const step of failed) {
        console.error(`Step "${step.id}" failed: ${step.error ?? 'unknown error'}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
