// Conditional step executor.
// Evaluates the condition and returns which branch to take.

import type { ConditionalStep, RuntimeContext } from '../types/index.js';
import type { ConditionalOutput } from './types.js';
import { resolveExpression } from '../expression/index.js';

/**
 * Execute a conditional step.
 * Evaluates the condition expression and returns the branch to execute.
 * The runtime is responsible for executing the branch steps.
 */
export function executeConditional(
  step: ConditionalStep,
  context: RuntimeContext,
): ConditionalOutput {
  const conditionResult = resolveExpression(step.condition, context);
  const isTruthy = Boolean(conditionResult);

  if (isTruthy) {
    return { branch: 'then', stepIds: step.then };
  } else if (step.else) {
    return { branch: 'else', stepIds: step.else };
  } else {
    return { branch: null, stepIds: [] };
  }
}
