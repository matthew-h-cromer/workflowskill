// LLM step executor.
// Interpolates the prompt template, calls the LLM adapter, and returns the response.

import type { LLMStep, LLMAdapter, RuntimeContext } from '../types/index.js';
import type { StepOutput } from './types.js';
import { StepExecutionError } from './types.js';
import { interpolatePrompt } from '../expression/index.js';

/**
 * Execute an LLM step.
 * Interpolates $-references in the prompt, calls the model, and returns the response.
 * The response_format field is passed as a hint but not enforced (per RFC).
 * If the response is valid JSON, it's parsed; otherwise returned as text.
 */
export async function executeLLM(
  step: LLMStep,
  _resolvedInputs: Record<string, unknown>,
  context: RuntimeContext,
  llmAdapter: LLMAdapter,
): Promise<StepOutput> {
  const prompt = interpolatePrompt(step.prompt, context);

  let result;
  try {
    result = await llmAdapter.call(step.model, prompt, step.response_format);
  } catch (err) {
    // LLM call failures are retriable (network errors, rate limits)
    throw new StepExecutionError(
      err instanceof Error ? err.message : String(err),
      true,
    );
  }

  // Try to parse JSON response for structured output
  let output: unknown = result.text;
  try {
    output = JSON.parse(result.text);
  } catch {
    // Not JSON — keep as text string
  }

  // Wrap in first output key if declared
  const outputKey = Object.keys(step.outputs)[0];
  if (outputKey) {
    output = { [outputKey]: output };
  }

  return { output, tokens: result.tokens };
}
