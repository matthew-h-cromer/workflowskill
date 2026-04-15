import type { BranchOptions, BranchSpec, SignalOptions, SignalResult } from "../runtime/protocol.js";
import { InMemoryRuntime } from "../runtime/memory.js";

/** Maximum foreach branches executed during dry-run. Keeps iteration at 1. */
const FOREACH_DRY_RUN_CAP = 1;

/** Maximum times a given step path may be entered before dry-run aborts the loop. */
const WHILE_DRY_RUN_CAP = 10;

/**
 * Error thrown when a while loop exceeds WHILE_DRY_RUN_CAP iterations.
 * Caught in validate/index.ts and reported as a dry-run-advisory (non-blocking).
 */
export class DryRunIterationCapError extends Error {
  constructor(path: string) {
    super(
      `dry-run: while loop at "${path}" exceeded ${WHILE_DRY_RUN_CAP} iterations with synthesized inputs. ` +
        "This is advisory — add explicit `-i` inputs to exercise the real exit condition.",
    );
    this.name = "DryRunIterationCapError";
  }
}

/**
 * Runtime used during `validate({ dryRun: true })`.
 *
 * Extends InMemoryRuntime with three dry-run-specific behaviours:
 *   - `sleep()`            → returns instantly (no real delay)
 *   - `waitForSignal()`    → resolves immediately as received with an empty payload
 *   - `executeBranches()`  → caps foreach fan-out at FOREACH_DRY_RUN_CAP (=1) to keep
 *                            dry-run fast and deterministic; parallel branches are unaffected
 *                            (they have static, named branches — no cap needed)
 *   - `executeStep()`      → tracks per-path invocation counts; throws DryRunIterationCapError
 *                            when a path is entered more than WHILE_DRY_RUN_CAP times
 *                            (catches non-terminating while loops under synthesized inputs)
 */
export class DryRunRuntime extends InMemoryRuntime {
  private readonly stepInvocations = new Map<string, number>();

  override async executeStep<T>(path: string, fn: () => Promise<T>): Promise<T> {
    // Normalize iteration indices so "loop/when[0]" and "loop/when[1]" share
    // the same structural key. This lets us detect non-terminating while loops
    // whose per-iteration paths are all unique.
    const structural = path.replace(/\[\d+\]/g, "[*]");
    const count = (this.stepInvocations.get(structural) ?? 0) + 1;
    this.stepInvocations.set(structural, count);
    if (count > WHILE_DRY_RUN_CAP) {
      throw new DryRunIterationCapError(path);
    }
    return super.executeStep(path, fn);
  }

  override async executeBranches<T>(
    path: string,
    branches: BranchSpec<T>[],
    opts?: BranchOptions,
  ): Promise<T[]> {
    // Cap foreach fan-out to 1 branch. The path segment encodes whether this is
    // a foreach (numeric branch names "0", "1", ...) vs a parallel (named branches).
    // We detect foreach branches by checking if ALL branch names are numeric strings.
    const isForeach =
      branches.length > 0 && branches.every((b) => /^\d+$/.test(b.name));

    const capped = isForeach ? branches.slice(0, FOREACH_DRY_RUN_CAP) : branches;
    return super.executeBranches(path, capped, opts);
  }

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
