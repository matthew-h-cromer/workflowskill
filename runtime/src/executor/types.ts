// Executor result types and error class.

import type { ExitStatus } from '../types/index.js';

/** Additional context attached to a step execution error. */
export interface StepErrorContext {
  /** Tool name if the error came from a tool step. */
  tool?: string;
  /** Expression string if the error came from expression resolution. */
  expression?: string;
}

/** Error thrown by step executors. */
export class StepExecutionError extends Error {
  constructor(
    message: string,
    /** Whether this error is retriable (network errors, rate limits, transient API failures). */
    public readonly retriable: boolean = false,
    /** Optional context about the error source. */
    public readonly context?: StepErrorContext,
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}

/** Result from a standard step execution (tool, transform). */
export interface StepOutput {
  output: unknown;
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
