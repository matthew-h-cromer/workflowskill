// Expression evaluator public API.
// Provides resolveExpression (for source/condition/where/each fields)
// and interpolatePrompt (for LLM prompt templates).

import type { RuntimeContext } from '../types/index.js';
import { lex } from './lexer.js';
import { parseExpression } from './parser.js';
import { evaluate } from './evaluator.js';

export { LexError } from './lexer.js';
export { ParseExprError } from './parser.js';
export { EvalError } from './evaluator.js';

/**
 * Resolve a single expression string against a runtime context.
 * Used for source, condition, where, each, and output fields.
 * Example: "$steps.fetch.output.messages.length >= 5"
 */
export function resolveExpression(expr: string, context: RuntimeContext): unknown {
  const tokens = lex(expr);
  const ast = parseExpression(tokens);
  return evaluate(ast, context);
}

/**
 * Interpolate $-references in a prompt template string.
 * Only resolves references and property access (no operators).
 * Objects/arrays are serialized as JSON. Null → empty string.
 *
 * Example: "Score this email: $steps.fetch.output.subject"
 */
export function interpolatePrompt(template: string, context: RuntimeContext): string {
  // Match $-references with optional property chains and bracket indexing.
  // Pattern: $identifier(.identifier | [expression])* — greedy match on the postfix chain.
  return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*|\[[^\]]*\])*/g, (match) => {
    try {
      const value = resolveExpression(match, context);
      return stringify(value);
    } catch {
      // If resolution fails, leave the reference as-is.
      // This is a reasonable choice: invalid references in prompts are
      // visible to the LLM and the author, rather than silently removed.
      return match;
    }
  });
}

/**
 * Coerce a value to its string representation for prompt interpolation.
 * Per the spec: objects/arrays → JSON, null → empty string.
 */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
