import type { Runtime } from "../../runtime/protocol.js";
import type { WhileStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import type { WalkFn } from "../branches.js";
import type { ExecutionContext } from "../context.js";
import { evaluateJsonataPredicate } from "../expressions/jsonata.js";
import { checkpointPredicate } from "../predicate.js";
import { normalizeRateLimit } from "../rate-limit.js";

export async function executeWhile(
  step: WhileStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<null> {
  const rateLimit = normalizeRateLimit(step.rate_limit) ?? null;

  let lastTokenTime = 0;
  let current = ctx;

  for (let i = 0; i < step.max_iterations; i++) {
    // Rate limiting: wait if necessary before starting this iteration
    if (rateLimit) {
      const now = Date.now();
      const minGap = rateLimit.perMs / rateLimit.max;
      const elapsed = now - lastTokenTime;
      if (elapsed < minGap) {
        await runtime.sleep(`${path}/rate_limit[${i}]`, minGap - elapsed);
      }
      lastTokenTime = Date.now();
    }

    const shouldContinue = await checkpointPredicate(runtime, `${path}/when[${i}]`, () =>
      evaluateJsonataPredicate(step.when, current),
    );

    if (!shouldContinue) break;

    // Execute body and update context with new step outputs
    current = await walk(step.body, `${path}/body[${i}]`, current, runtime, toolkit);
  }

  return null;
}
