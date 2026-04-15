import type { Runtime } from "../../runtime/protocol.js";
import type { IfStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import type { WalkFn } from "../branches.js";
import type { ExecutionContext } from "../context.js";
import { evaluateJsonataPredicate } from "../expressions/jsonata.js";
import { checkpointPredicate } from "../predicate.js";

export async function executeIf(
  step: IfStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<ExecutionContext> {
  const taken = await checkpointPredicate(runtime, `${path}/when`, () =>
    evaluateJsonataPredicate(step.when, ctx),
  );

  const body = taken ? step.then : (step.else ?? []);
  return walk(body, `${path}/${taken ? "then" : "else"}`, ctx, runtime, toolkit);
}
