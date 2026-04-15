import type { Runtime } from "../../runtime/protocol.js";
import { parseDurationMs } from "../../schema/expressions.js";
import type { ActionStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import type { ExecutionContext } from "../context.js";
import { interpolateArgs } from "../expressions/jsonata.js";
import { deriveIdempotencyKey } from "../idempotency.js";

export async function executeAction(
  step: ActionStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
): Promise<unknown> {
  return runtime.executeStep(
    path,
    async () => {
      const resolvedArgs = step.with
        ? await interpolateArgs(step.with as Record<string, unknown>, ctx)
        : {};
      const idempotencyKey = deriveIdempotencyKey(runtime.runId, path);
      return toolkit.execute(step.uses, resolvedArgs, idempotencyKey);
    },
    { retry: step.retry, timeoutMs: step.timeout ? parseDurationMs(step.timeout) : undefined },
  );
}
