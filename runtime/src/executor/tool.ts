// Tool step executor.
// Invokes a registered tool via the ToolAdapter and returns the response.

import type { ToolStep, ToolAdapter } from '../types/index.js';
import type { StepOutput } from './types.js';
import { StepExecutionError } from './types.js';

/**
 * Execute a tool step.
 * Passes resolved inputs as the tool's arguments. Returns the tool's response.
 * The runtime does not interpret the response (per spec).
 */
export async function executeTool(
  step: ToolStep,
  resolvedInputs: Record<string, unknown>,
  toolAdapter: ToolAdapter,
): Promise<StepOutput> {
  const result = await toolAdapter.invoke(step.tool, resolvedInputs);
  if (result.error) {
    // Tool errors are considered retriable (network issues, rate limits, transient failures)
    throw new StepExecutionError(result.error, true, { tool: step.tool });
  }
  return { output: result.output };
}
