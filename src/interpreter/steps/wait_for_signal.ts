import type { Runtime } from "../../runtime/protocol.js";
import { parseDurationMs } from "../../schema/expressions.js";
import type { WaitForSignalStep } from "../../schema/steps.js";
import type { ExecutionContext } from "../context.js";
import { interpolate } from "../expressions/jsonata.js";
import { resolveTimeoutPolicy } from "../timeouts.js";

export async function executeWaitForSignal(
  step: WaitForSignalStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
): Promise<unknown> {
  const timeoutMs = parseDurationMs(step.timeout);

  // Build the match predicate from the match dict.
  // Each value is a JSONata expression evaluated against a signal-scope context
  // where `signal` is the incoming payload.
  const matchEntries = step.match ? Object.entries(step.match) : [];

  // The predicate is pure: given a payload, it evaluates each match expression
  // against { signal: payload, ...ctx } and compares to the key's value.
  // We resolve the expected values eagerly (before the wait) so they're stable.
  const expectedValues: Array<[string, unknown]> = [];
  for (const [key, exprStr] of matchEntries) {
    const expected = await interpolate(exprStr, ctx);
    expectedValues.push([key, expected]);
  }

  function matchPredicate(payload: unknown): boolean {
    if (expectedValues.length === 0) return true;
    const payloadObj = payload as Record<string, unknown>;
    for (const [key, expected] of expectedValues) {
      // Support dot-notation key traversal
      const actual = getNestedValue(payloadObj, key);
      if (actual !== expected) return false;
    }
    return true;
  }

  const result = await runtime.waitForSignal(path, {
    name: step.signal,
    match: matchPredicate,
    timeoutMs,
  });

  if (!result.received) {
    return resolveTimeoutPolicy(step.on_timeout, step.id, `Signal "${step.signal}" timed out`);
  }

  return result.payload;
}

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
