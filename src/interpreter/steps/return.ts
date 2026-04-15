import type { Runtime } from "../../runtime/protocol.js";
import type { ReturnStep } from "../../schema/steps.js";
import type { ExecutionContext } from "../context.js";
import { interpolate } from "../expressions/jsonata.js";

export class ReturnSignal {
  constructor(public readonly value: unknown) {}
}

export async function executeReturn(
  step: ReturnStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
): Promise<never> {
  const value = await runtime.executeStep(path, () => interpolate(step.value, ctx));
  throw new ReturnSignal(value);
}
