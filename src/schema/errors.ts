/**
 * Thrown when a declared workflow input cannot be coerced to its declared type.
 */
export class WorkflowInputError extends Error {
  readonly input: string;
  readonly declaredType: string;
  readonly received: unknown;

  constructor(input: string, declaredType: string, received: unknown) {
    const display =
      received === null ? "null" : received === undefined ? "undefined" : JSON.stringify(received);
    super(`Input "${input}" must be of type ${declaredType}, got ${display}`);
    this.name = "WorkflowInputError";
    this.input = input;
    this.declaredType = declaredType;
    this.received = received;
  }
}

/**
 * Runtime error shape. Propagated through catch blocks and continue_on_error.
 */
export interface WorkflowError {
  message: string;
  code: string;
  step_id?: string;
  retryable: boolean;
  details?: unknown;
}

export function isWorkflowError(value: unknown): value is WorkflowError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkflowError).message === "string" &&
    typeof (value as WorkflowError).code === "string" &&
    typeof (value as WorkflowError).retryable === "boolean"
  );
}

export function toWorkflowError(err: unknown, stepId?: string): WorkflowError {
  if (isWorkflowError(err)) return err;
  if (err instanceof Error) {
    const base: WorkflowError = {
      message: err.message,
      code: "RUNTIME_ERROR",
      retryable: false,
      details: err.stack,
    };
    if (stepId !== undefined) base.step_id = stepId;
    return base;
  }
  const base: WorkflowError = {
    message: String(err),
    code: "UNKNOWN_ERROR",
    retryable: false,
  };
  if (stepId !== undefined) base.step_id = stepId;
  return base;
}
