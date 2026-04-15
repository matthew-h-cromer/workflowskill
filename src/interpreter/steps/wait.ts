import type { Runtime } from "../../runtime/protocol.js";
import { parseDurationMs } from "../../schema/expressions.js";
import type { WaitStep } from "../../schema/steps.js";
import type { ExecutionContext } from "../context.js";
import { interpolate } from "../expressions/jsonata.js";

export async function executeWait(
  step: WaitStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
): Promise<null> {
  let ms: number;

  if (step.duration !== undefined) {
    ms = parseDurationMs(step.duration);
  } else if (step.until !== undefined) {
    const targetRaw = await runtime.executeStep(
      `${path}/until`,
      () => interpolate(step.until as string, ctx) as Promise<unknown>,
    );
    const targetDate = new Date(String(targetRaw));
    ms = Math.max(0, targetDate.getTime() - runtime.now().getTime());
  } else {
    throw new Error(`Wait step at ${path} has neither duration nor until`);
  }

  await runtime.sleep(path, ms);
  return null;
}
