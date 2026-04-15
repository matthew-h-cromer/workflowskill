import type { Runtime } from "../../runtime/protocol.js";
import { toWorkflowError } from "../../schema/errors.js";
import type { Step, TryStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import type { WalkFn } from "../branches.js";
import type { ExecutionContext } from "../context.js";
import { currentScope, withBindings } from "../context.js";
import { ReturnSignal } from "./return.js";

export async function executeTry(
  step: TryStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<ExecutionContext> {
  let resultCtx = ctx;
  let bodyError: unknown = null;
  let branchRan: Step[] = step.body;

  try {
    resultCtx = await walk(step.body, `${path}/body`, ctx, runtime, toolkit);
  } catch (err) {
    if (err instanceof ReturnSignal) throw err; // let return propagate
    bodyError = err;
  }

  if (bodyError !== null && step.catch !== undefined) {
    const workflowErr = toWorkflowError(bodyError);
    const catchCtx = withBindings(resultCtx, { error: workflowErr });
    try {
      resultCtx = await walk(step.catch, `${path}/catch`, catchCtx, runtime, toolkit);
      bodyError = null; // error handled
      branchRan = step.catch;
    } catch (catchErr) {
      if (catchErr instanceof ReturnSignal) throw catchErr;
      // catch block itself threw — rethrow after finally
      bodyError = catchErr;
    }
  }

  if (step.finally !== undefined) {
    // finally always runs; we ignore its return value (context side-effects only)
    try {
      resultCtx = await walk(step.finally, `${path}/finally`, resultCtx, runtime, toolkit);
    } catch (finallyErr) {
      if (finallyErr instanceof ReturnSignal) throw finallyErr;
      // If both body and finally throw, finally's error wins (matches JS semantics)
      throw finallyErr;
    }
  }

  if (bodyError !== null) throw bodyError;

  // Publish the last step of whichever branch ran as the try step's own
  // output, so downstream code can reference `steps.<try_id>.output`
  // without caring whether body or catch produced it.
  const lastStep = branchRan.at(-1);
  if (lastStep !== undefined) {
    const lastEntry = currentScope(resultCtx).get(lastStep.id);
    if (lastEntry !== undefined) {
      currentScope(resultCtx).set(step.id, lastEntry);
    }
  }

  return resultCtx;
}
