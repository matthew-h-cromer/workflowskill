import jsonata from "jsonata";
import type { ExecutionContext } from "../context.js";
import { truncate } from "./common.js";

/**
 * Evaluate a JSONata expression against the current execution context.
 *
 * The expression receives the execution context as its root data.
 * Use `steps.<id>.output`, `input.<name>`, `workflow.*`, `env.*`, etc.
 */
export async function evaluateJsonataPredicate(
  expr: string,
  ctx: ExecutionContext,
): Promise<boolean> {
  const result = await evaluateJsonata(expr, ctx);
  if (Array.isArray(result)) return result.length > 0;
  return Boolean(result);
}

export async function evaluateJsonata(expr: string, ctx: ExecutionContext): Promise<unknown> {
  try {
    const expression = jsonata(expr);
    const result = await expression.evaluate(serializeContext(ctx));
    return sanitizeJsonata(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err));
    throw new Error(`JSONata evaluation error in expression "${truncate(expr)}": ${msg}`);
  }
}

/**
 * Strip JSONata-internal properties (sequence, keepArray, cons, tupleStream)
 * from arrays and objects returned by JSONata evaluation.
 * These properties are enumerable but should not be visible to downstream code
 * or equality checks.
 */
function sanitizeJsonata(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Create a fresh array to strip JSONata-internal enumerable properties
    // (sequence, keepArray, cons, tupleStream) that JSONata attaches to path
    // expression results. Array.from() produces a plain array with only
    // numeric indices — none of the extra properties from the original.
    return Array.from(value as unknown[]).map(sanitizeJsonata);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = sanitizeJsonata(obj[key]);
    }
    return obj;
  }
  return value;
}

/**
 * Scan a string for `{{ ... }}` spans and replace each with its evaluated value.
 * Spans that evaluate to non-string values are coerced via String().
 * A string that is entirely one `{{ expr }}` span (no surrounding text) returns
 * the raw evaluated value — preserving objects and arrays.
 */
export async function interpolate(template: string, ctx: ExecutionContext): Promise<unknown> {
  const SPAN_RE = /\{\{(.+?)\}\}/gs;

  // Count spans to decide between raw passthrough and string interpolation
  const allSpans = [...template.matchAll(SPAN_RE)];
  if (allSpans.length === 0) return template;

  // Single span occupying the whole string → return raw value
  if (allSpans.length === 1) {
    const match0 = allSpans[0];
    const fullMatch = match0?.[0] ?? "";
    const exprRaw = match0?.[1] ?? "";
    if (template.trim() === fullMatch.trim()) {
      return evaluateJsonata(exprRaw.trim(), ctx);
    }
  }

  // Multiple spans (or single span embedded in text) → string interpolation
  let result = template;
  for (const match of allSpans) {
    const fullMatch = match[0] ?? "";
    const exprRaw = match[1] ?? "";
    const value = await evaluateJsonata(exprRaw.trim(), ctx);
    result = result.replace(fullMatch, value == null ? "" : String(value));
  }
  return result;
}

/**
 * Recursively interpolate `{{ }}` spans throughout a nested value.
 * Mirrors `emitTemplate` in `validate/walk.ts` so static analysis and
 * runtime stay in sync: strings interpolated, arrays recursed element-wise,
 * objects recursed key-wise, primitives passed through unchanged.
 */
async function interpolateValue(value: unknown, ctx: ExecutionContext): Promise<unknown> {
  if (typeof value === "string") return interpolate(value, ctx);
  if (Array.isArray(value)) return Promise.all(value.map((v) => interpolateValue(v, ctx)));
  if (value !== null && typeof value === "object")
    return interpolateArgs(value as Record<string, unknown>, ctx);
  return value;
}

/**
 * Evaluate a record of `with:` args. Each value is recursed through
 * `interpolateValue` — strings interpolated, arrays and objects traversed
 * deeply, primitives passed through unchanged.
 */
export async function interpolateArgs(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    result[key] = await interpolateValue(value, ctx);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Context serialization
// ---------------------------------------------------------------------------

/**
 * Serialize ExecutionContext to a plain JS object for JSONata evaluation.
 * The returned object is the root `$` in JSONata expressions.
 *
 * Steps are serialized as:
 *   { steps: { <id>: { output: <val>, error?: <err> }, ... } }
 *
 * foreach output:
 *   steps.<id>.output[i].<inner_id>.output  → iteration i's inner step output
 *
 * parallel output:
 *   steps.<id>.output.<branchName>.<inner_id>.output  → branch's inner step
 */
export function serializeContext(ctx: ExecutionContext): Record<string, unknown> {
  return {
    steps: serializeSteps(ctx.stack),
    input: ctx.input,
    workflow: ctx.workflow,
    env: ctx.env,
    // Extra loop bindings injected by foreach, try/catch, etc.
    ...ctx.bindings,
  };
}

/** Merge all scopes outer→inner so inner scope wins, then serialize each entry. */
function serializeSteps(stack: ExecutionContext["stack"]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const scope of stack) {
    for (const [id, entry] of scope.entries()) {
      merged[id] = serializeScopeEntry(entry);
    }
  }
  return merged;
}

type ScopeEntry = import("../context.js").ScopeEntry;
type StepScope = import("../context.js").StepScope;

/**
 * Serialize a ScopeEntry to a plain JS object that JSONata can traverse.
 *
 * Three cases:
 * 1. Leaf StepResult     → { output: <primitive>, error?: ... }
 * 2. foreach entry       → { output: [{ <inner_id>: {...}, ... }, ...], error?: ... }
 * 3. parallel entry      → { output: { <branch>: { <inner_id>: {...}, ... }, ... }, error?: ... }
 */
function serializeScopeEntry(entry: ScopeEntry): unknown {
  const { output } = entry;
  const error = "error" in entry && entry.error !== undefined ? entry.error : undefined;

  // foreach case: output is an array of StepScopes (Maps)
  if (Array.isArray(output)) {
    if (output.length > 0 && output[0] instanceof Map) {
      const serialized = output.map((scope) => serializeStepScope(scope as StepScope));
      return error !== undefined ? { output: serialized, error } : { output: serialized };
    }
    // plain array output from a leaf step — return as-is
    return error !== undefined ? { output, error } : { output };
  }

  // parallel case: output is a plain Record<branchName, StepScope>
  // Exposed as `steps.<id>.branches.<name>.<inner_id>.output` per the spec.
  if (output !== null && typeof output === "object" && !(output instanceof Map)) {
    const outputObj = output as Record<string, unknown>;
    const firstVal = Object.values(outputObj)[0];
    if (firstVal instanceof Map) {
      // It's a parallel branches record
      const serialized: Record<string, unknown> = {};
      for (const [branchName, scope] of Object.entries(outputObj)) {
        serialized[branchName] = serializeStepScope(scope as StepScope);
      }
      return error !== undefined ? { branches: serialized, error } : { branches: serialized };
    }
  }

  // Leaf StepResult — output is a plain value (or null)
  return error !== undefined ? { output, error } : { output };
}

/** Convert a StepScope Map into a plain object for JSONata. */
function serializeStepScope(scope: StepScope): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [id, entry] of scope.entries()) {
    result[id] = serializeScopeEntry(entry);
  }
  return result;
}
