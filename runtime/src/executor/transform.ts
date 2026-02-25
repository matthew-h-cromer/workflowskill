// Transform step executor: filter, map, sort.
// Pure data manipulation — no external calls, no LLM.

import type {
  TransformStep,
  TransformFilterStep,
  TransformMapStep,
  TransformSortStep,
  RuntimeContext,
} from '../types/index.js';
import { resolveExpression } from '../expression/index.js';

/**
 * Execute a transform step.
 * Returns an object with the first declared output key mapped to the transformed array.
 */
export function executeTransform(
  step: TransformStep,
  resolvedInputs: Record<string, unknown>,
  context: RuntimeContext,
): Record<string, unknown> {
  const items = getInputArray(resolvedInputs);
  let result: unknown[];

  switch (step.operation) {
    case 'filter':
      result = executeFilter(step, items, context);
      break;
    case 'map':
      result = executeMap(step, items, context);
      break;
    case 'sort':
      result = executeSort(step, items);
      break;
  }

  const outputKey = Object.keys(step.outputs)[0] ?? 'items';
  return { [outputKey]: result };
}

/** Find the array to transform from resolved inputs. */
function getInputArray(inputs: Record<string, unknown>): unknown[] {
  // Convention: look for 'items' key first
  if ('items' in inputs && Array.isArray(inputs.items)) return inputs.items;
  // Fall back to first array value
  for (const val of Object.values(inputs)) {
    if (Array.isArray(val)) return val;
  }
  // Wrap single value in array for single-item transforms (e.g., echo fixture)
  const first = Object.values(inputs)[0];
  return first != null ? [first] : [];
}

/** Filter: keep items where the `where` expression is truthy. */
function executeFilter(
  step: TransformFilterStep,
  items: unknown[],
  context: RuntimeContext,
): unknown[] {
  return items.filter((item, index) => {
    const itemCtx: RuntimeContext = { ...context, item, index };
    return Boolean(resolveExpression(step.where, itemCtx));
  });
}

/** Map: project each item into a new shape using the `expression` object. */
function executeMap(
  step: TransformMapStep,
  items: unknown[],
  context: RuntimeContext,
): unknown[] {
  return items.map((item, index) => {
    const itemCtx: RuntimeContext = { ...context, item, index };
    const result: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(step.expression)) {
      result[key] = resolveMapValue(expr, itemCtx);
    }
    return result;
  });
}

/**
 * Resolve a map expression value.
 * $-prefixed strings are resolved as expressions. Otherwise treated as literals.
 * Spec note: the spec also allows nested objects and non-string literals in map expressions,
 * but the current Zod schema constrains values to Record<string, string>.
 */
function resolveMapValue(value: string, context: RuntimeContext): unknown {
  if (value.startsWith('$')) {
    return resolveExpression(value, context);
  }
  return value;
}

/** Sort: order items by a field path in the given direction (default: asc). */
function executeSort(step: TransformSortStep, items: unknown[]): unknown[] {
  const direction = step.direction ?? 'asc';
  return [...items].sort((a, b) => {
    const aVal = getNestedField(a, step.field);
    const bVal = getNestedField(b, step.field);
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/** Access a nested field by dot-notation path (e.g., "user.name"). */
function getNestedField(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
