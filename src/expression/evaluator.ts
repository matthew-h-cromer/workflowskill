// Evaluator for the WorkflowSkill expression language.
// Takes an AST and a RuntimeContext, produces a resolved value.

import type { RuntimeContext } from '../types/index.js';
import type { ASTNode } from './parser.js';

export class EvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalError';
  }
}

/**
 * Evaluate an AST node against a runtime context.
 * Returns the resolved value (primitive, object, array, or null).
 */
export function evaluate(node: ASTNode, context: RuntimeContext): unknown {
  switch (node.kind) {
    case 'reference':
      return resolveReference(node.name, context);

    case 'property_access':
      return resolvePropertyAccess(node, context);

    case 'index_access':
      return resolveIndexAccess(node, context);

    case 'literal':
      return node.value;

    case 'binary':
      return evaluateBinary(node.operator, node.left, node.right, context);

    case 'unary':
      return evaluateUnary(node.operator, node.operand, context);
  }
}

function resolveReference(name: string, context: RuntimeContext): unknown {
  switch (name) {
    case 'inputs':
      return context.inputs;
    case 'steps':
      return context.steps;
    case 'item':
      return context.item;
    case 'index':
      return context.index;
    case 'output':
      return context.output;
    default:
      throw new EvalError(`Unknown reference: $${name}`);
  }
}

function resolvePropertyAccess(
  node: { object: ASTNode; property: string },
  context: RuntimeContext,
): unknown {
  const obj = evaluate(node.object, context);

  if (obj === null || obj === undefined) {
    return undefined;
  }

  // Special property: .length on arrays
  if (node.property === 'length' && Array.isArray(obj)) {
    return obj.length;
  }

  if (typeof obj === 'object') {
    return (obj as Record<string, unknown>)[node.property];
  }

  return undefined;
}

function resolveIndexAccess(
  node: { object: ASTNode; index: ASTNode },
  context: RuntimeContext,
): unknown {
  const obj = evaluate(node.object, context);
  const idx = evaluate(node.index, context);

  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (Array.isArray(obj) && typeof idx === 'number') {
    return obj[idx];
  }

  if (typeof obj === 'object') {
    const key = typeof idx === 'number' ? String(idx) : idx;
    if (typeof key === 'string') {
      return (obj as Record<string, unknown>)[key];
    }
  }

  return undefined;
}

function evaluateBinary(
  op: string,
  left: ASTNode,
  right: ASTNode,
  context: RuntimeContext,
): unknown {
  const lval = evaluate(left, context);
  const rval = evaluate(right, context);

  switch (op) {
    case '==':
      return lval === rval;
    case '!=':
      return lval !== rval;
    case '>':
      return toNumber(lval) > toNumber(rval);
    case '<':
      return toNumber(lval) < toNumber(rval);
    case '>=':
      return toNumber(lval) >= toNumber(rval);
    case '<=':
      return toNumber(lval) <= toNumber(rval);
    case '&&':
      return isTruthy(lval) && isTruthy(rval);
    case '||':
      return isTruthy(lval) || isTruthy(rval);
    default:
      throw new EvalError(`Unknown operator: ${op}`);
  }
}

function evaluateUnary(op: string, operand: ASTNode, context: RuntimeContext): unknown {
  const val = evaluate(operand, context);
  switch (op) {
    case '!':
      return !isTruthy(val);
    default:
      throw new EvalError(`Unknown unary operator: ${op}`);
  }
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    if (!isNaN(n)) return n;
  }
  if (typeof val === 'boolean') return val ? 1 : 0;
  return 0;
}

function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true; // objects are truthy
}
