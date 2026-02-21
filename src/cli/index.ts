#!/usr/bin/env node
// WorkflowSkill CLI — validate, run, and generate workflows.

import { Command } from 'commander';
import { validateCommand } from './validate.js';
import { runCommand } from './run.js';
import { generateCommand } from './generate.js';

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
  .action(runCommand);

program
  .command('generate <prompt>')
  .description('Generate a WorkflowSkill YAML from a natural language prompt')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .action(generateCommand);

program.parse();
