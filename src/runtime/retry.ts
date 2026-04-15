import type { RetryPolicy } from "../schema/steps.js";

/**
 * Apply a retry policy to an async function call.
 * Implements exponential, linear, and fixed backoff.
 */
export async function applyRetry<T>(fn: () => Promise<T>, policy?: RetryPolicy): Promise<T> {
  if (!policy) return fn();

  const maxAttempts = policy.max_attempts;
  const allowedCodes = policy.on ? new Set(policy.on) : null;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Check code allowlist
      if (allowedCodes !== null) {
        const code =
          err != null && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined;
        if (code === undefined || !allowedCodes.has(code)) throw err;
      }

      if (attempt === maxAttempts) break;

      const delayMs = computeDelay(policy.backoff, attempt);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function computeDelay(backoff: RetryPolicy["backoff"], attempt: number): number {
  const base = 1_000; // 1 second base
  switch (backoff) {
    case "exponential":
      return base * 2 ** (attempt - 1);
    case "linear":
      return base * attempt;
    case "fixed":
      return base;
    default:
      return base;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
