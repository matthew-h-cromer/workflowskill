#!/usr/bin/env node
// WorkflowSkill CLI — validate and run workflows.

import { Command } from 'commander';
import { validateCommand } from './validate.js';
import { runCommand } from './run.js';

const program = new Command();

program
  .name('workflowskill')
  .description('WorkflowSkill runtime CLI')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate one or more workflow SKILL.md files without executing')
  .argument('<files...>', 'Workflow files to validate')
  .action(validateCommand);

program
  .command('run <file>')
  .description('Execute a workflow SKILL.md file')
  .option('-i, --input <json>', 'Workflow inputs as JSON string', '{}')
  .option('-l, --log-dir <dir>', 'Directory to write run logs', 'runs')
  .action(runCommand);

program.parse();
