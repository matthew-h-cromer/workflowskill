import kleur from "kleur";
import { runWorkflow } from "../interpreter/index.js";
import { parseWorkflowFile } from "../loader/parse.js";
import type { Runtime } from "../runtime/protocol.js";
import { loadRuntime } from "../runtime/registry.js";
import type { Toolkit } from "../toolkit/protocol.js";
import { loadToolkit } from "../toolkit/registry.js";
import { Display } from "./display.js";

export interface RunOptions {
  input: string[];
  jsonInput?: string;
  env: string[];
  envFile?: string;
  toolkit: string;
  runtime: string;
}

export async function runCommand(filePath: string, opts: RunOptions): Promise<void> {
  const display = new Display();

  // Parse the workflow file
  const parseResult = await parseWorkflowFile(filePath);
  if (!parseResult.ok) {
    process.stderr.write(kleur.red(`Parse error: ${parseResult.error.message}\n`));
    if (parseResult.error.issues) {
      for (const issue of parseResult.error.issues) {
        process.stderr.write(kleur.dim(`  ${issue.path}: ${issue.message}\n`));
      }
    }
    process.exit(1);
  }

  const workflow = parseResult.workflow;

  // Build inputs
  const inputs: Record<string, unknown> = {};

  // --json-input flag
  if (opts.jsonInput !== undefined) {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(opts.jsonInput, "utf-8");
    Object.assign(inputs, JSON.parse(raw));
  }

  // -i key=value flags
  for (const pair of opts.input) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      process.stderr.write(kleur.red(`Invalid --input flag: "${pair}" (expected key=value)\n`));
      process.exit(1);
    }
    const key = pair.slice(0, eq);
    const rawVal = pair.slice(eq + 1);
    // Try to parse as JSON, fall back to string
    try {
      inputs[key] = JSON.parse(rawVal);
    } catch {
      inputs[key] = rawVal;
    }
  }

  // Build env (never from process.env — only from explicit flags)
  const env: Record<string, unknown> = {};

  if (opts.envFile !== undefined) {
    const { readFile } = await import("node:fs/promises");
    const lines = (await readFile(opts.envFile, "utf-8")).split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }

  for (const pair of opts.env) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      process.stderr.write(kleur.red(`Invalid --env flag: "${pair}" (expected KEY=VALUE)\n`));
      process.exit(1);
    }
    env[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  let runtime: Runtime;
  let toolkit: Toolkit;
  try {
    runtime = await loadRuntime(opts.runtime);
    toolkit = await loadToolkit(opts.toolkit);
  } catch (err) {
    process.stderr.write(kleur.red(`${(err as Error).message}\n`));
    process.exit(1);
  }

  display.workflowStart(workflow.name);

  try {
    const outputs = await runWorkflow(workflow, inputs, runtime, toolkit, { env });
    display.workflowComplete(outputs);
  } catch (err) {
    display.workflowError(err);
    process.exit(1);
  }
}
