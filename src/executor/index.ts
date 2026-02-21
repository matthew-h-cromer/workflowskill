// Step executor dispatch.
// Routes each step to the appropriate executor based on its type.

import type {
  Step,
  ToolAdapter,
  LLMAdapter,
  RuntimeContext,
  TokenUsage,
  ExitStatus,
} from '../types/index.js';
import { executeTransform } from './transform.js';
import { executeConditional } from './conditional.js';
import { executeExit } from './exit.js';
import { executeTool } from './tool.js';
import { executeLLM } from './llm.js';

export { StepExecutionError } from './types.js';
export type { StepOutput, ConditionalOutput, ExitOutput } from './types.js';
export { executeTransform } from './transform.js';
export { executeConditional } from './conditional.js';
export { executeExit } from './exit.js';
export { executeTool } from './tool.js';
export { executeLLM } from './llm.js';

/** Discriminated result from dispatching a step. */
export type DispatchResult =
  | { kind: 'output'; output: unknown; tokens?: TokenUsage }
  | { kind: 'branch'; branch: 'then' | 'else' | null; stepIds: string[] }
  | { kind: 'exit'; status: ExitStatus; output: unknown };

/**
 * Dispatch a step to the appropriate executor.
 * The runtime calls this for each step in the execution loop.
 */
export async function dispatch(
  step: Step,
  resolvedInputs: Record<string, unknown>,
  context: RuntimeContext,
  toolAdapter: ToolAdapter,
  llmAdapter: LLMAdapter,
): Promise<DispatchResult> {
  switch (step.type) {
    case 'tool': {
      const result = await executeTool(step, resolvedInputs, toolAdapter);
      return { kind: 'output', ...result };
    }
    case 'llm': {
      const result = await executeLLM(step, resolvedInputs, context, llmAdapter);
      return { kind: 'output', ...result };
    }
    case 'transform': {
      const output = executeTransform(step, resolvedInputs, context);
      return { kind: 'output', output };
    }
    case 'conditional': {
      const result = executeConditional(step, context);
      return { kind: 'branch', ...result };
    }
    case 'exit': {
      const result = executeExit(step, context);
      return { kind: 'exit', ...result };
    }
  }
}
