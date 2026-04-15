import type { Runtime } from "../runtime/protocol.js";
import { WorkflowInputError, toWorkflowError } from "../schema/errors.js";
import type { Step } from "../schema/steps.js";
import type { Workflow } from "../schema/workflow.js";
import type { Toolkit } from "../toolkit/protocol.js";
import { type ExecutionContext, createContext, recordStep } from "./context.js";
import { interpolate } from "./expressions/jsonata.js";
import { ReturnSignal } from "./steps/return.js";

import { executeAction } from "./steps/action.js";
import { executeForeach } from "./steps/foreach.js";
import { executeIf } from "./steps/if.js";
import { executeParallel } from "./steps/parallel.js";
import { executeReturn } from "./steps/return.js";
import { executeSwitch } from "./steps/switch.js";
import { executeTransform } from "./steps/transform.js";
import { executeTry } from "./steps/try.js";
import { executeWait } from "./steps/wait.js";
import { executeWaitForSignal } from "./steps/wait_for_signal.js";
import { executeWhile } from "./steps/while.js";

// ---------------------------------------------------------------------------
// Input coercion
// ---------------------------------------------------------------------------

/**
 * Coerce a raw input value to the declared type. String representations of
 * numbers, booleans, and JSON structures are accepted; already-correct JS
 * types are passed through unchanged.
 *
 * Returns undefined/null unchanged so callers can rely on $exists() guards.
 * Throws WorkflowInputError when the value cannot be coerced.
 */
function coerceInput(name: string, type: string, raw: unknown): unknown {
  // Absent inputs — preserve so workflows can use $exists() guards
  if (raw === undefined || raw === null) return raw;

  switch (type) {
    case "string":
      return typeof raw === "string" ? raw : String(raw);

    case "number": {
      if (typeof raw === "number") return raw;
      if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        if (!Number.isNaN(n)) return n;
      }
      throw new WorkflowInputError(name, type, raw);
    }

    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string") {
        const lower = raw.toLowerCase();
        if (lower === "true") return true;
        if (lower === "false") return false;
      }
      throw new WorkflowInputError(name, type, raw);
    }

    case "array": {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // fall through
        }
      }
      throw new WorkflowInputError(name, type, raw);
    }

    case "object": {
      if (typeof raw === "object" && !Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
        } catch {
          // fall through
        }
      }
      throw new WorkflowInputError(name, type, raw);
    }

    default:
      // Unknown type — pass through without coercion
      return raw;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunWorkflowOptions {
  env?: Record<string, unknown>;
  owner?: { email?: string; [k: string]: unknown };
}

/**
 * Run a parsed workflow.
 *
 * @param workflow  Parsed + validated Workflow object
 * @param inputs    Key/value inputs matching workflow.inputs declarations
 * @param runtime   Runtime implementation (InMemoryRuntime for CLI mock mode)
 * @param toolkit   Toolkit implementation (WeldableMockToolkit for CLI)
 * @param opts      Optional env vars and owner identity
 * @returns         The workflow's output dict
 */
export async function runWorkflow(
  workflow: Workflow,
  inputs: Record<string, unknown>,
  runtime: Runtime,
  toolkit: Toolkit,
  opts: RunWorkflowOptions = {},
): Promise<Record<string, unknown>> {
  // Apply input defaults and coerce to declared types
  const resolvedInputs: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(workflow.inputs ?? {})) {
    const raw = inputs[name] !== undefined ? inputs[name] : spec.default;
    resolvedInputs[name] = coerceInput(name, spec.type, raw);
  }
  // Also pass through any undeclared inputs
  for (const [name, value] of Object.entries(inputs)) {
    if (!(name in resolvedInputs)) resolvedInputs[name] = value;
  }

  const ctx = createContext(
    resolvedInputs,
    {
      owner: opts.owner ?? runtime.owner,
      run_id: runtime.runId,
      name: workflow.name,
      started_at: runtime.now().toISOString(),
    },
    opts.env ?? {},
  );

  let finalCtx: ExecutionContext;
  try {
    finalCtx = await walkSteps(workflow.steps, "steps", ctx, runtime, toolkit);
  } catch (err) {
    if (err instanceof ReturnSignal) {
      const value = err.value;
      return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : { value };
    }
    throw err;
  }

  // Evaluate top-level outputs
  if (workflow.outputs) {
    const result: Record<string, unknown> = {};
    for (const [key, exprStr] of Object.entries(workflow.outputs)) {
      result[key] = await runtime.executeStep(
        `outputs/${key}`,
        () => interpolate(exprStr, finalCtx) as Promise<unknown>,
      );
    }
    return result;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Step walker — deterministic tree traversal
// ---------------------------------------------------------------------------

/**
 * Walk an array of steps sequentially.
 * Returns the updated context (step results are written into ctx's scope stack).
 *
 * IMPORTANT: this function MUST traverse steps in a stable, deterministic order.
 * The call sequence of runtime.executeStep / executeBranches / sleep / waitForSignal
 * must be identical for the same workflow + inputs to ensure replay-based runtimes
 * (e.g. DBOS) can match ordinal positions to their checkpoints.
 */
export async function walkSteps(
  steps: Step[],
  basePath: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
): Promise<ExecutionContext> {
  let current = ctx;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const path = `${basePath}[${i}]`;
    current = await executeStep(step, path, current, runtime, toolkit);
  }
  return current;
}

async function executeStep(
  step: Step,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
): Promise<ExecutionContext> {
  const stepId = step.id;

  try {
    const outcome = await dispatchStep(step, path, ctx, runtime, toolkit);
    const effectiveCtx = outcome.context ?? ctx;
    recordStep(effectiveCtx, stepId, { output: outcome.output });
    return effectiveCtx;
  } catch (err) {
    if (err instanceof ReturnSignal) throw err;

    if (step.continue_on_error) {
      const workflowErr = toWorkflowError(err, stepId);
      recordStep(ctx, stepId, { output: null, error: workflowErr });
      return ctx;
    }
    throw err;
  }
}

/**
 * Per-step outcome returned by handlers. `context` is set only by steps
 * that mutate the scope stack (if/switch/try/foreach/parallel/while bodies).
 */
interface StepOutcome {
  output: unknown;
  context?: ExecutionContext;
}

async function dispatchStep(
  step: Step,
  path: string,
  ctx: ExecutionContext,
  runtime: Runtime,
  toolkit: Toolkit,
): Promise<StepOutcome> {
  switch (step.type) {
    case "action":
      return { output: await executeAction(step, path, ctx, runtime, toolkit) };
    case "transform":
      return { output: await executeTransform(step, path, ctx, runtime) };
    case "return":
      await executeReturn(step, path, ctx, runtime); // throws ReturnSignal
      return { output: null };
    case "wait":
      await executeWait(step, path, ctx, runtime);
      return { output: null };
    case "if":
      return {
        output: null,
        context: await executeIf(step, path, ctx, runtime, toolkit, walkSteps),
      };
    case "switch":
      return {
        output: null,
        context: await executeSwitch(step, path, ctx, runtime, toolkit, walkSteps),
      };
    case "foreach":
      return { output: await executeForeach(step, path, ctx, runtime, toolkit, walkSteps) };
    case "while":
      await executeWhile(step, path, ctx, runtime, toolkit, walkSteps);
      return { output: null };
    case "parallel":
      return { output: await executeParallel(step, path, ctx, runtime, toolkit, walkSteps) };
    case "try":
      return {
        output: null,
        context: await executeTry(step, path, ctx, runtime, toolkit, walkSteps),
      };
    case "wait_for_signal":
      return { output: await executeWaitForSignal(step, path, ctx, runtime) };
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
