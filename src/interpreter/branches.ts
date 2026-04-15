import type { Runtime } from "../runtime/protocol.js";
import type { Step } from "../schema/steps.js";
import type { Toolkit } from "../toolkit/protocol.js";
import { type ExecutionContext, type StepScope, extendScope } from "./context.js";

export type WalkFn = (
  steps: Step[],
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
) => Promise<ExecutionContext>;

/**
 * Run one branch body: extend the scope, walk the steps, and return the
 * innermost scope. Shared by `foreach` iterations and `parallel` branches.
 */
export async function runBranchBody(
  body: Step[],
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
  bindings?: Record<string, unknown>,
): Promise<StepScope> {
  let branchCtx = extendScope(ctx);
  if (bindings) {
    branchCtx = { ...branchCtx, bindings: { ...branchCtx.bindings, ...bindings } };
  }
  const resultCtx = await walk(body, path, branchCtx, runtime, toolkit);
  return resultCtx.stack.at(-1) ?? new Map();
}
