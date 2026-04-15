import type { Runtime } from "../../runtime/protocol.js";
import type { ForeachStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import { type WalkFn, runBranchBody } from "../branches.js";
import type { ExecutionContext, StepScope } from "../context.js";
import { interpolate } from "../expressions/jsonata.js";
import { normalizeRateLimit } from "../rate-limit.js";

export async function executeForeach(
  step: ForeachStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<StepScope[]> {
  // Evaluate items expression (checkpointed — stable on replay).
  // items uses {{ }} template syntax per the spec.
  const items = await runtime.executeStep(`${path}/items`, () => interpolate(step.items, ctx));

  if (!Array.isArray(items)) {
    throw new Error(
      `foreach at ${path}: items expression must return an array, got ${typeof items}`,
    );
  }

  const rateLimit = normalizeRateLimit(step.rate_limit);

  const branches = items.map((item, i) => ({
    name: String(i),
    fn: (): Promise<StepScope> =>
      runBranchBody(step.body, `${path}/body[${i}]`, ctx, runtime, toolkit, walk, {
        [step.as]: item,
        $index: i,
      }),
  }));

  const scopes = await runtime.executeBranches(path, branches, {
    concurrency: step.concurrency,
    rateLimit,
  });

  return scopes;
}
