import { createHash } from "node:crypto";

/**
 * Derive a deterministic idempotency key for an action invocation.
 * The key is a function of run_id + step path. Because `path` already
 * encodes foreach iteration index and parallel branch name (e.g.
 * `steps[1]/body[3]/...`), the hash is unique per action call site.
 *
 * This makes within-run retries and resumes safe: the same action call
 * always gets the same key, so integrations that honor idempotency headers
 * (Stripe, Square, etc.) will deduplicate transparently.
 */
export function deriveIdempotencyKey(runId: string, stepPath: string): string {
  return createHash("sha256").update(`${runId}|${stepPath}`).digest("hex").slice(0, 40);
}
