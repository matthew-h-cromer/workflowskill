// CLI: validate command — check workflows without running them.

import { readFileSync } from 'node:fs';
import { parseWorkflowFromMd } from '../parser/index.js';
import { ParseError } from '../parser/index.js';
import { validateWorkflow } from '../validator/index.js';

export function validateCommand(files: string[]): void {
  let hasErrors = false;

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      console.error(`✗ ${file}: Cannot read file`);
      hasErrors = true;
      continue;
    }

    // Parse
    let workflow;
    try {
      workflow = parseWorkflowFromMd(content);
    } catch (err) {
      if (err instanceof ParseError) {
        console.error(`✗ ${file}: ${err.message}`);
        for (const detail of err.details) {
          console.error(`    ${detail.path}: ${detail.message}`);
        }
      } else {
        console.error(`✗ ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
      hasErrors = true;
      continue;
    }

    // Validate
    const result = validateWorkflow(workflow);
    if (!result.valid) {
      console.error(`✗ ${file}: Validation errors`);
      for (const error of result.errors) {
        console.error(`    ${error.path}: ${error.message}`);
      }
      hasErrors = true;
      continue;
    }

    console.log(`✓ ${file} (${workflow.steps.length} steps)`);
  }

  if (hasErrors) {
    process.exit(1);
  }
}
