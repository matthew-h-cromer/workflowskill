import type { Runtime } from "../../runtime/protocol.js";
import type { TransformStep } from "../../schema/steps.js";
import type { ExecutionContext } from "../context.js";
import { evaluateJsonata } from "../expressions/jsonata.js";

export async function executeTransform(
  step: TransformStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
): Promise<unknown> {
  return runtime.executeStep(path, () => evaluateJsonata(step.expr, ctx));
}
