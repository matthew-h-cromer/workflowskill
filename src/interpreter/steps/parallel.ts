import type { Runtime } from "../../runtime/protocol.js";
import type { ParallelStep } from "../../schema/steps.js";
import type { Toolkit } from "../../toolkit/protocol.js";
import { type WalkFn, runBranchBody } from "../branches.js";
import type { ExecutionContext, StepScope } from "../context.js";

export async function executeParallel(
  step: ParallelStep,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
  walk: WalkFn,
): Promise<Record<string, StepScope>> {
  const branches = Object.keys(step.branches).map((name) => ({
    name,
    fn: async (): Promise<[string, StepScope]> => {
      const scope = await runBranchBody(
        step.branches[name] ?? [],
        `${path}/branch[${name}]`,
        ctx,
        runtime,
        toolkit,
        walk,
      );
      return [name, scope];
    },
  }));

  const results = await runtime.executeBranches(path, branches);
  return Object.fromEntries(results);
}
