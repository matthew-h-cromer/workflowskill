import type { Runtime } from "../../runtime/protocol.js";
import type { SwitchStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import type { WalkFn } from "../branches.js";
import type { ExecutionContext } from "../context.js";
import { evaluateJsonata } from "../expressions/jsonata.js";
import { checkpointPredicate } from "../predicate.js";

export async function executeSwitch(
  step: SwitchStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<ExecutionContext> {
  const key = await checkpointPredicate(runtime, `${path}/on`, async () =>
    String(await evaluateJsonata(step.on, ctx)),
  );

  const body = step.cases[key] ?? step.default ?? [];
  return walk(body, `${path}/case[${key}]`, ctx, runtime, toolkit);
}
