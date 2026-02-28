// Exit step executor.
// Resolves the output expression and signals workflow termination.

import type { ExitStep, RuntimeContext } from '../types/index.js';
import type { ExitOutput } from './types.js';
import { resolveExpression, containsTemplate, resolveTemplate } from '../expression/index.js';

/**
 * Execute an exit step.
 * Output can be:
 * - A string expression: resolved against context
 * - An object literal: each string value starting with $ is resolved, others kept as-is
 * - Undefined: null output
 */
export function executeExit(
  step: ExitStep,
  context: RuntimeContext,
): ExitOutput {
  let output: unknown = null;
  if (step.output) {
    if (typeof step.output === 'string') {
      output = resolveExpression(step.output, context);
    } else {
      // Object literal — resolve expression values within it
      output = resolveOutputObject(step.output, context);
    }
  }
  return { status: step.status, output };
}

function resolveOutputObject(
  obj: Record<string, unknown>,
  context: RuntimeContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      if (val.startsWith('$$')) {
        result[key] = val.slice(1);
      } else if (containsTemplate(val)) {
        result[key] = resolveTemplate(val, context);
      } else if (val.startsWith('$')) {
        result[key] = resolveExpression(val, context);
      } else {
        result[key] = val;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}
