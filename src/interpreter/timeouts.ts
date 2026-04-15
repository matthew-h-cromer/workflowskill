import { WorkflowTimeoutError } from "./errors.js";

export type OnTimeout = "abort" | "continue" | "escalate";

/**
 * Apply a step's `on_timeout` policy to a timeout event.
 *
 * - "abort": throws WorkflowTimeoutError with the supplied message.
 * - "escalate": not supported by InMemoryRuntime; falls back to abort
 *   (the caller may override by customizing `escalateMessage`).
 * - "continue": returns `null` so the caller can substitute it as the
 *   step's output.
 */
export function resolveTimeoutPolicy(
  policy: OnTimeout,
  stepId: string,
  abortMessage: string,
  escalateMessage = `${abortMessage} (escalate not supported by this runtime)`,
): null {
  if (policy === "abort") {
    throw new WorkflowTimeoutError(stepId, abortMessage);
  }
  if (policy === "escalate") {
    throw new WorkflowTimeoutError(stepId, escalateMessage);
  }
  return null;
}
