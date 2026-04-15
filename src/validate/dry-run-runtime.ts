import { InMemoryRuntime } from "../runtime/memory.js";
import type { SignalOptions, SignalResult } from "../runtime/protocol.js";

/**
 * Runtime used during `validate({ dryRun: true })`.
 *
 * Reuses InMemoryRuntime for step caching and fan-out, but short-circuits
 * side-effecting time waits so dry-run completes immediately:
 *   - `sleep()`            → returns instantly
 *   - `waitForSignal()`    → resolves as received with an empty payload
 *
 * This lets agents exercise the full step tree without blocking on long
 * timeouts.
 */
export class DryRunRuntime extends InMemoryRuntime {
  override async sleep(_path: string, _ms: number): Promise<void> {
    return;
  }

  override async waitForSignal<T = unknown>(
    _path: string,
    _opts: SignalOptions,
  ): Promise<SignalResult<T>> {
    return { received: true, payload: {} as T };
  }
}
