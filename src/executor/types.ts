// Executor result types and error class.

import type { ExitStatus, TokenUsage } from '../types/index.js';

/** Error thrown by step executors. */
export class StepExecutionError extends Error {
  constructor(
    message: string,
    /** Whether this error is retriable (network errors, rate limits, transient API failures). */
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}

/** Result from a standard step execution (tool, llm, transform). */
export interface StepOutput {
  output: unknown;
  tokens?: TokenUsage;
}

/** Result from a conditional step execution. */
export interface ConditionalOutput {
  branch: 'then' | 'else' | null;
  stepIds: string[];
}

/** Result from an exit step execution. */
export interface ExitOutput {
  status: ExitStatus;
  output: unknown;
}
