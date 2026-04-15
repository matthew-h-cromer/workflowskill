#!/usr/bin/env node
import { Command } from "commander";
import { actionsDescribeCommand } from "./actions-describe.js";
import { actionsListCommand } from "./actions-list.js";
import { integrationsListCommand } from "./integrations-list.js";
import { login } from "./login.js";
import { runCommand } from "./run.js";
import { validateCommand } from "./validate.js";

const program = new Command();

program
  .name("workflowskill")
  .description("Run and author declarative YAML workflows")
  .version("1.0.0");

program
  .command("run <file>")
  .description("Run a workflow file locally with mock action execution")
  .option(
    "-i, --input <key=value>",
    "Workflow input (repeatable)",
    (v, acc: string[]) => {
      acc.push(v);
      return acc;
    },
    [],
  )
  .option("--json-input <path>", "Path to a JSON file to use as workflow inputs")
  .option(
    "-e, --env <KEY=VALUE>",
    "Add an env var to the workflow context (repeatable)",
    (v, acc: string[]) => {
      acc.push(v);
      return acc;
    },
    [],
  )
  .option("--env-file <path>", "Path to a KEY=VALUE file to populate workflow env (not .env)")
  .option("--toolkit <name>", "Toolkit to execute actions against", "weldable")
  .option("--runtime <name>", "Runtime for step orchestration", "memory")
  .action(
    async (
      file: string,
      opts: {
        input: string[];
        jsonInput?: string;
        env: string[];
        envFile?: string;
        toolkit: string;
        runtime: string;
      },
    ) => {
      await runCommand(file, opts);
    },
  );

program
  .command("login")
  .description("Show instructions for connecting Weldable API access")
  .action(async () => {
    await login();
  });

// ---------------------------------------------------------------------------
// validate command
// ---------------------------------------------------------------------------

program
  .command("validate <file>")
  .description("Statically validate a workflow file and report issues")
  .option("--toolkit <name>", "Toolkit to validate actions against", "weldable")
  .option("--no-dry-run", "Skip dry-run execution (dry-run is on by default)")
  .option(
    "-i, --input <key=value>",
    "Workflow input for dry-run (repeatable)",
    (v, acc: string[]) => {
      acc.push(v);
      return acc;
    },
    [],
  )
  .option("--json", "Output results as JSON", false)
  .action(
    async (
      file: string,
      opts: { toolkit: string; noDryRun: boolean; input: string[]; json: boolean },
    ) => {
      await validateCommand(file, opts);
    },
  );

// ---------------------------------------------------------------------------
// actions subcommands
// ---------------------------------------------------------------------------

const actionsCmd = program
  .command("actions")
  .description("Browse and inspect actions available in a toolkit");

actionsCmd
  .command("list")
  .description("List all actions in a toolkit")
  .argument("[integrations...]", "Filter to one or more integrations (e.g. gmail slack)")
  .option("--toolkit <name>", "Toolkit to query", "weldable")
  .action(async (integrations: string[], opts: { toolkit: string }) => {
    await actionsListCommand(opts, integrations);
  });

actionsCmd
  .command("describe <action-id>")
  .description("Describe a single action: full inputs, outputs, and preview")
  .option("--toolkit <name>", "Toolkit to query", "weldable")
  .option("--json", "Output as JSON", false)
  .action(async (actionId: string, opts: { toolkit: string; json: boolean }) => {
    await actionsDescribeCommand(actionId, opts);
  });

// ---------------------------------------------------------------------------
// integrations subcommands
// ---------------------------------------------------------------------------

const integrationsCmd = program
  .command("integrations")
  .description("Browse available integrations in a toolkit");

integrationsCmd
  .command("list")
  .description("List all available integrations")
  .option("--toolkit <name>", "Toolkit to query", "weldable")
  .action(async (opts: { toolkit: string }) => {
    await integrationsListCommand(opts);
  });

program.parse();
