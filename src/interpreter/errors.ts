export { isWorkflowError, toWorkflowError } from "../schema/errors.js";
export type { WorkflowError } from "../schema/errors.js";

export class WorkflowTimeoutError extends Error {
  readonly code = "TIMEOUT";
  readonly retryable = false;
  constructor(
    public readonly stepId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowTimeoutError";
  }
}

export class WorkflowAbortError extends Error {
  readonly code = "ABORT";
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "WorkflowAbortError";
  }
}
