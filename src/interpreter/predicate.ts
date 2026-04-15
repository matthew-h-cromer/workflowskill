import type { Runtime } from "../runtime/protocol.js";

/**
 * Checkpoint a synchronous predicate/value evaluation through the runtime
 * so it's stable across replay. Wraps the sync result in a resolved promise.
 */
export function checkpointPredicate<T>(
  runtime: Runtime,
  path: string,
  evaluate: () => T,
): Promise<T> {
  return runtime.executeStep(path, () => Promise.resolve(evaluate()));
}
