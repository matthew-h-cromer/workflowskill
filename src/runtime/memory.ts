import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  BranchOptions,
  BranchSpec,
  Runtime,
  SignalOptions,
  SignalResult,
  StepOptions,
} from "./protocol.js";
import { applyRetry } from "./retry.js";

/**
 * InMemoryRuntime — for mock-only CLI authoring.
 *
 * - No persistence: process exit loses all state.
 * - Signals are delivered via an EventEmitter (in-process only).
 * - Suitable for running workflows with any in-process `Toolkit`, including `WeldableMockToolkit`.
 */
export class InMemoryRuntime implements Runtime {
  readonly runId: string;
  readonly owner: { email?: string; [k: string]: unknown };

  private readonly stepCache = new Map<string, unknown>();
  private readonly emitter = new EventEmitter();

  constructor(
    opts: {
      runId?: string;
      owner?: { email?: string; [k: string]: unknown };
    } = {},
  ) {
    this.runId = opts.runId ?? randomUUID();
    this.owner = opts.owner ?? {};
  }

  now(): Date {
    return new Date();
  }

  async executeStep<T>(path: string, fn: () => Promise<T>, opts?: StepOptions): Promise<T> {
    if (this.stepCache.has(path)) {
      return this.stepCache.get(path) as T;
    }
    const result = await applyRetry(fn, opts?.retry);
    this.stepCache.set(path, result);
    return result;
  }

  async executeBranches<T>(
    path: string,
    branches: BranchSpec<T>[],
    opts?: BranchOptions,
  ): Promise<T[]> {
    const concurrency = opts?.concurrency ?? Number.POSITIVE_INFINITY;
    const rateLimit = opts?.rateLimit;

    if (branches.length === 0) return [];

    if (concurrency >= branches.length && !rateLimit) {
      // Fast path: fully parallel
      return Promise.all(branches.map((b) => b.fn()));
    }

    // Semaphore + optional token bucket
    const results: T[] = new Array(branches.length);
    let active = 0;
    let index = 0;
    let lastStartTime = 0;

    return new Promise((resolve, reject) => {
      const tryNext = () => {
        while (active < concurrency && index < branches.length) {
          if (rateLimit) {
            const now = Date.now();
            const minGap = rateLimit.perMs / rateLimit.max;
            const elapsed = now - lastStartTime;
            if (elapsed < minGap) {
              setTimeout(tryNext, minGap - elapsed);
              return;
            }
            lastStartTime = now;
          }

          const i = index++;
          active++;
          const branch = branches[i];
          if (!branch) continue;

          branch
            .fn()
            .then((result) => {
              results[i] = result;
              active--;
              if (index < branches.length) {
                tryNext();
              } else if (active === 0) {
                resolve(results);
              }
            })
            .catch((err) => {
              reject(err);
            });
        }

        if (index >= branches.length && active === 0) {
          resolve(results);
        }
      };

      tryNext();
    });
  }

  async sleep(_path: string, ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForSignal<T = unknown>(_path: string, opts: SignalOptions): Promise<SignalResult<T>> {
    return new Promise((resolve) => {
      const deadline = Date.now() + opts.timeoutMs;

      const onSignal = (payload: unknown) => {
        if (opts.match(payload)) {
          clearTimeout(timer);
          resolve({ received: true, payload: payload as T });
        }
        // else: discard and keep listening
      };

      const timer = setTimeout(
        () => {
          this.emitter.off(opts.name, onSignal);
          resolve({ received: false, reason: "timeout" });
        },
        Math.max(0, deadline - Date.now()),
      );

      this.emitter.on(opts.name, onSignal);
    });
  }

  // ---------------------------------------------------------------------------
  // Test/CLI helpers
  // ---------------------------------------------------------------------------

  /**
   * Send a signal to any waiting `wait_for_signal` step.
   * Call this from tests or CLI input handlers.
   */
  sendSignal(signalName: string, payload: unknown): void {
    this.emitter.emit(signalName, payload);
  }
}
