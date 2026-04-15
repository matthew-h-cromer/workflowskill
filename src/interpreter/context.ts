import type { WorkflowError } from "../schema/errors.js";

// ---------------------------------------------------------------------------
// Scope types
// ---------------------------------------------------------------------------

export interface StepResult {
  output: unknown;
  error?: WorkflowError;
}

/**
 * A scope is a map from step id → value.
 *
 * Values can be:
 *   - StepResult      → a leaf step's output/error
 *   - StepScope[]     → foreach: array of per-iteration scopes
 *   - Record<string, StepScope[]>  → parallel: branch-name → branch scope (currently unused, branches have their own StepScope)
 *
 * Actually we keep it simpler: foreach output is stored as
 *   { output: StepScope[] } where each item is a scope of that iteration's steps.
 * parallel output is stored as
 *   { output: Record<string, StepScope> } where each value is a branch's scope.
 *
 * From JSONata's perspective `steps.enrich.output[i].lookup.output` accesses
 * iteration i's lookup step's output.
 */
export type StepScope = Map<string, ScopeEntry>;

export type ScopeEntry =
  | StepResult
  | { output: StepScope[]; error?: WorkflowError } // foreach
  | { output: Record<string, StepScope>; error?: WorkflowError }; // parallel

// ---------------------------------------------------------------------------
// Execution context
// ---------------------------------------------------------------------------

export interface WorkflowMeta {
  owner: { email?: string; [k: string]: unknown };
  run_id: string;
  name: string;
  started_at: string;
}

export interface ExecutionContext {
  /** Lexical scope stack. Resolution walks end → start (innermost last). */
  stack: StepScope[];

  /** Workflow inputs (from top-level `inputs:`) */
  input: Record<string, unknown>;

  /** Workflow metadata */
  workflow: WorkflowMeta;

  /**
   * Publisher-scoped env vars.
   * In CLI mock mode: populated via --env flags only (never process.env).
   */
  env: Record<string, unknown>;

  /**
   * Extra bindings injected by loop primitives (foreach `as`, `$index`;
   * error in try/catch; etc.). Merged at the root of JSONata context.
   */
  bindings: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

export function createContext(
  input: Record<string, unknown>,
  workflow: WorkflowMeta,
  env: Record<string, unknown>,
): ExecutionContext {
  return {
    stack: [new Map()],
    input,
    workflow,
    env,
    bindings: {},
  };
}

/** Return the innermost scope (writes go here). */
export function currentScope(ctx: ExecutionContext): StepScope {
  const scope = ctx.stack.at(-1);
  if (!scope) throw new Error("ExecutionContext has an empty stack — this is a bug");
  return scope;
}

/**
 * Extend the lexical scope stack with a fresh inner scope for a body
 * (foreach iteration, parallel branch, etc.). Returns a new context —
 * the original is unchanged. There is no matching "pop": scopes are
 * discarded when the derived context goes out of scope.
 */
export function extendScope(ctx: ExecutionContext): ExecutionContext {
  return {
    ...ctx,
    stack: [...ctx.stack, new Map()],
  };
}

/** Write a leaf step result to the innermost scope. */
export function recordStep(ctx: ExecutionContext, id: string, result: StepResult): void {
  currentScope(ctx).set(id, result);
}

/** Write extra bindings on top of the context (non-destructive). */
export function withBindings(
  ctx: ExecutionContext,
  bindings: Record<string, unknown>,
): ExecutionContext {
  return { ...ctx, bindings: { ...ctx.bindings, ...bindings } };
}

/** Resolve a step id from the innermost scope outward. Returns undefined if not found. */
export function resolveStep(ctx: ExecutionContext, id: string): ScopeEntry | undefined {
  for (let i = ctx.stack.length - 1; i >= 0; i--) {
    const entry = ctx.stack[i]?.get(id);
    if (entry !== undefined) return entry;
  }
  return undefined;
}
