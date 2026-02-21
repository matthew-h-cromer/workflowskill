// Exit step executor.
// Resolves the output expression and signals workflow termination.

import type { ExitStep, RuntimeContext } from '../types/index.js';
import type { ExitOutput } from './types.js';
import { resolveExpression } from '../expression/index.js';

/**
 * Execute an exit step.
 * Resolves the output expression (if present) and returns the exit signal.
 * The runtime is responsible for halting execution.
 */
export function executeExit(
  step: ExitStep,
  context: RuntimeContext,
): ExitOutput {
  let output: unknown = null;
  if (step.output) {
    output = resolveExpression(step.output, context);
  }
  return { status: step.status, output };
}
