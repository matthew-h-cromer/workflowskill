import type { RetryPolicy } from "../schema/steps.js";

export interface StepOptions {
  retry?: RetryPolicy | undefined;
  /** Step-level timeout in milliseconds */
  timeoutMs?: number | undefined;
}

export interface BranchSpec<T> {
  name: string;
  fn: () => Promise<T>;
}

export interface BranchOptions {
  concurrency?: number | undefined;
  rateLimit?: { max: number; perMs: number } | undefined;
}

export interface SignalOptions {
  name: string;
  match: (payload: unknown) => boolean;
  timeoutMs: number;
}

export type SignalResult<T = unknown> =
  | { received: true; payload: T }
  | { received: false; reason: "timeout" };

/**
 * The Runtime protocol. Abstracts step execution and durability.
 *
 * ## DBOS mapping (for implementors):
 *
 * - `executeStep`    → `DBOS.runStep(fn, { name: path })`
 *   Identity is by call-order ordinal, not path. The interpreter MUST traverse
 *   deterministically so ordinals align with replay.
 *
 * - `executeBranches` → one child workflow per branch enqueued on a WorkflowQueue.
 *   Using Promise.all inside a single DBOS workflow would interleave ordinals
 *   non-deterministically and corrupt replay.
 *
 * - `sleep`          → `DBOS.sleep(ms)`
 *
 * - `waitForSignal`  → `DBOS.recv` loop with predicate; predicate must be pure.
 *
 * ## InMemoryRuntime (this repo):
 *   All methods run in-memory; no persistence. Suitable for mock-only CLI authoring.
 */
export interface Runtime {
  readonly runId: string;
  readonly owner: { email?: string; [k: string]: unknown };

  now(): Date;

  /**
   * Atomic "execute-or-return-cached" primitive for leaf steps.
   * `path` is used as the step name for observability; durability identity is
   * by call order on replay-based runtimes.
   */
  executeStep<T>(path: string, fn: () => Promise<T>, opts?: StepOptions): Promise<T>;

  /**
   * Fan-out primitive for `foreach` and `parallel`.
   * On DBOS: spawns one child workflow per branch on a WorkflowQueue.
   * On InMemoryRuntime: Promise.all with a semaphore + token-bucket limiter.
   *
   * Returns outputs in the same order as `branches`.
   */
  executeBranches<T>(path: string, branches: BranchSpec<T>[], opts?: BranchOptions): Promise<T[]>;

  /** Durable sleep. Maps to DBOS.sleep. */
  sleep(path: string, ms: number): Promise<void>;

  /**
   * Signal receive with match predicate + timeout.
   * The predicate must be a pure function of the payload (derived from YAML match: dict).
   */
  waitForSignal<T = unknown>(path: string, opts: SignalOptions): Promise<SignalResult<T>>;
}
