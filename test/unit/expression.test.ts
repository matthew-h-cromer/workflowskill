import { describe, it, expect } from 'vitest';
import { resolveExpression, interpolatePrompt, LexError, ParseExprError, EvalError } from '../../src/expression/index.js';
import type { RuntimeContext } from '../../src/types/index.js';
import { lex } from '../../src/expression/lexer.js';
import { parseExpression } from '../../src/expression/parser.js';

// ─── Test context ─────────────────────────────────────────────────────────────

const ctx: RuntimeContext = {
  inputs: {
    account: 'user@example.com',
    threshold: 7,
    enabled: true,
  },
  steps: {
    fetch: {
      output: {
        messages: [
          { from: 'alice@example.com', subject: 'Hello', score: 9 },
          { from: 'bob@example.com', subject: 'Meeting', score: 3 },
        ],
      },
    },
    empty_step: {
      output: null,
    },
  },
};

const iterCtx: RuntimeContext = {
  ...ctx,
  item: { from: 'alice@example.com', subject: 'Hello', score: 9 },
  index: 0,
};

// ─── Lexer tests ──────────────────────────────────────────────────────────────

describe('lexer', () => {
  it('tokenizes a simple reference', () => {
    const tokens = lex('$inputs.account');
    expect(tokens.map(t => t.type)).toEqual(['DOLLAR_REF', 'DOT', 'IDENTIFIER', 'EOF']);
    expect(tokens[0]!.value).toBe('inputs');
    expect(tokens[2]!.value).toBe('account');
  });

  it('tokenizes a comparison expression', () => {
    const tokens = lex('$item.score >= 7');
    expect(tokens.map(t => t.type)).toEqual([
      'DOLLAR_REF', 'DOT', 'IDENTIFIER', 'GTE', 'NUMBER', 'EOF',
    ]);
  });

  it('tokenizes logical operators', () => {
    const tokens = lex('$item.a && $item.b || !$item.c');
    const types = tokens.map(t => t.type);
    expect(types).toContain('AND');
    expect(types).toContain('OR');
    expect(types).toContain('NOT');
  });

  it('tokenizes string literals', () => {
    const tokens = lex('$item.name == "alice"');
    expect(tokens.find(t => t.type === 'STRING')?.value).toBe('alice');
  });

  it('tokenizes boolean and null', () => {
    const tokens = lex('true false null');
    expect(tokens.map(t => t.type)).toEqual(['BOOLEAN', 'BOOLEAN', 'NULL', 'EOF']);
  });

  it('throws on unexpected character', () => {
    expect(() => lex('$item @ 5')).toThrow(LexError);
  });

  it('throws on unterminated string', () => {
    expect(() => lex('"hello')).toThrow(LexError);
  });

  it('tokenizes bracket indexing with literal', () => {
    const tokens = lex('$steps.fetch.output.results[0]');
    const types = tokens.map(t => t.type);
    expect(types).toContain('LBRACKET');
    expect(types).toContain('NUMBER');
    expect(types).toContain('RBRACKET');
  });

  it('tokenizes bracket indexing with reference', () => {
    const tokens = lex('$items[$index]');
    const types = tokens.map(t => t.type);
    expect(types).toContain('LBRACKET');
    expect(types).toContain('DOLLAR_REF');
    expect(types).toContain('RBRACKET');
  });
});

// ─── Parser tests ─────────────────────────────────────────────────────────────

describe('parser', () => {
  it('parses a reference', () => {
    const ast = parseExpression(lex('$inputs'));
    expect(ast.kind).toBe('reference');
  });

  it('parses property access chain', () => {
    const ast = parseExpression(lex('$steps.fetch.output.messages'));
    expect(ast.kind).toBe('property_access');
  });

  it('parses comparison', () => {
    const ast = parseExpression(lex('$item.score >= 7'));
    expect(ast.kind).toBe('binary');
    if (ast.kind === 'binary') {
      expect(ast.operator).toBe('>=');
    }
  });

  it('parses logical AND/OR with correct precedence', () => {
    // a || b && c  should be  a || (b && c)
    const ast = parseExpression(lex('$item.a || $item.b && $item.c'));
    expect(ast.kind).toBe('binary');
    if (ast.kind === 'binary') {
      expect(ast.operator).toBe('||');
      expect(ast.right.kind).toBe('binary');
      if (ast.right.kind === 'binary') {
        expect(ast.right.operator).toBe('&&');
      }
    }
  });

  it('parses unary NOT', () => {
    const ast = parseExpression(lex('!$item.active'));
    expect(ast.kind).toBe('unary');
  });

  it('parses parenthesized expression', () => {
    const ast = parseExpression(lex('($item.a || $item.b) && $item.c'));
    expect(ast.kind).toBe('binary');
    if (ast.kind === 'binary') {
      expect(ast.operator).toBe('&&');
      expect(ast.left.kind).toBe('binary');
    }
  });

  it('parses bracket index with literal', () => {
    const ast = parseExpression(lex('$steps.fetch.output.results[0]'));
    expect(ast.kind).toBe('index_access');
    if (ast.kind === 'index_access') {
      expect(ast.object.kind).toBe('property_access');
      expect(ast.index.kind).toBe('literal');
      if (ast.index.kind === 'literal') {
        expect(ast.index.value).toBe(0);
      }
    }
  });

  it('parses bracket index with reference', () => {
    const ast = parseExpression(lex('$items[$index]'));
    expect(ast.kind).toBe('index_access');
    if (ast.kind === 'index_access') {
      expect(ast.object.kind).toBe('reference');
      expect(ast.index.kind).toBe('reference');
    }
  });

  it('parses chained bracket then dot: $result.body.results[0].title', () => {
    const ast = parseExpression(lex('$result.body.results[0].title'));
    // Outermost should be property_access(.title)
    expect(ast.kind).toBe('property_access');
    if (ast.kind === 'property_access') {
      expect(ast.property).toBe('title');
      // Its object should be index_access([0])
      expect(ast.object.kind).toBe('index_access');
    }
  });

  it('throws on unexpected token', () => {
    expect(() => parseExpression(lex('>='))).toThrow(ParseExprError);
  });
});

// ─── resolveExpression tests ──────────────────────────────────────────────────

describe('resolveExpression', () => {
  // Reference resolution
  it('resolves $inputs.account', () => {
    expect(resolveExpression('$inputs.account', ctx)).toBe('user@example.com');
  });

  it('resolves $inputs.threshold', () => {
    expect(resolveExpression('$inputs.threshold', ctx)).toBe(7);
  });

  it('resolves $steps.fetch.output.messages', () => {
    const result = resolveExpression('$steps.fetch.output.messages', ctx);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('resolves nested property: $steps.fetch.output.messages.length', () => {
    expect(resolveExpression('$steps.fetch.output.messages.length', ctx)).toBe(2);
  });

  it('resolves $item in iteration context', () => {
    expect(resolveExpression('$item.from', iterCtx)).toBe('alice@example.com');
  });

  it('resolves $index in iteration context', () => {
    expect(resolveExpression('$index', iterCtx)).toBe(0);
  });

  it('returns undefined for missing nested property', () => {
    expect(resolveExpression('$steps.fetch.output.nonexistent', ctx)).toBeUndefined();
  });

  it('returns undefined for property on null output', () => {
    expect(resolveExpression('$steps.empty_step.output.field', ctx)).toBeUndefined();
  });

  // Comparisons
  it('evaluates == correctly', () => {
    expect(resolveExpression('$inputs.threshold == 7', ctx)).toBe(true);
    expect(resolveExpression('$inputs.threshold == 5', ctx)).toBe(false);
  });

  it('evaluates != correctly', () => {
    expect(resolveExpression('$inputs.threshold != 5', ctx)).toBe(true);
  });

  it('evaluates > correctly', () => {
    expect(resolveExpression('$inputs.threshold > 5', ctx)).toBe(true);
    expect(resolveExpression('$inputs.threshold > 10', ctx)).toBe(false);
  });

  it('evaluates >= correctly', () => {
    expect(resolveExpression('$inputs.threshold >= 7', ctx)).toBe(true);
    expect(resolveExpression('$inputs.threshold >= 8', ctx)).toBe(false);
  });

  it('evaluates < correctly', () => {
    expect(resolveExpression('$inputs.threshold < 10', ctx)).toBe(true);
  });

  it('evaluates <= correctly', () => {
    expect(resolveExpression('$inputs.threshold <= 7', ctx)).toBe(true);
  });

  // Logical operators
  it('evaluates && correctly', () => {
    expect(resolveExpression('$inputs.enabled && $inputs.threshold > 5', ctx)).toBe(true);
    expect(resolveExpression('$inputs.enabled && $inputs.threshold > 10', ctx)).toBe(false);
  });

  it('evaluates || correctly', () => {
    expect(resolveExpression('$inputs.threshold > 10 || $inputs.enabled', ctx)).toBe(true);
  });

  it('evaluates ! correctly', () => {
    expect(resolveExpression('!$inputs.enabled', ctx)).toBe(false);
  });

  // Item comparison in filter context
  it('evaluates $item.score >= $inputs.threshold', () => {
    expect(resolveExpression('$item.score >= $inputs.threshold', iterCtx)).toBe(true);
  });

  // Equality with strings
  it('evaluates string equality', () => {
    expect(resolveExpression('$inputs.account == "user@example.com"', ctx)).toBe(true);
  });

  // Boolean and null literals
  it('evaluates boolean comparison', () => {
    expect(resolveExpression('$inputs.enabled == true', ctx)).toBe(true);
  });

  it('evaluates null comparison', () => {
    expect(resolveExpression('$steps.empty_step.output == null', ctx)).toBe(true);
  });

  // Truthiness edge cases
  it('null is falsy', () => {
    expect(resolveExpression('!$steps.empty_step.output', ctx)).toBe(true);
  });

  it('empty string is falsy', () => {
    const emptyCtx: RuntimeContext = { ...ctx, item: '' };
    expect(resolveExpression('!$item', emptyCtx)).toBe(true);
  });

  it('zero is falsy', () => {
    const zeroCtx: RuntimeContext = { ...ctx, item: 0 };
    expect(resolveExpression('!$item', zeroCtx)).toBe(true);
  });

  // $result reference
  it('resolves $result as the raw executor result', () => {
    const resultCtx: RuntimeContext = {
      inputs: {},
      steps: {},
      result: { body: { title: 'Test Title', userId: 42 } },
    };
    expect(resolveExpression('$result.body.title', resultCtx)).toBe('Test Title');
    expect(resolveExpression('$result.body.userId', resultCtx)).toBe(42);
  });

  it('resolves $result with nested objects', () => {
    const resultCtx: RuntimeContext = {
      inputs: {},
      steps: {},
      result: { data: { items: [1, 2, 3] } },
    };
    expect(resolveExpression('$result.data.items.length', resultCtx)).toBe(3);
  });

  it('resolves $result as undefined when not set', () => {
    expect(resolveExpression('$result', ctx)).toBeUndefined();
  });

  // Bracket indexing
  it('resolves $steps.fetch.output.messages[0]', () => {
    const result = resolveExpression('$steps.fetch.output.messages[0]', ctx);
    expect(result).toEqual({ from: 'alice@example.com', subject: 'Hello', score: 9 });
  });

  it('resolves $steps.fetch.output.messages[1].subject', () => {
    expect(resolveExpression('$steps.fetch.output.messages[1].subject', ctx)).toBe('Meeting');
  });

  it('resolves out-of-bounds bracket index to undefined', () => {
    expect(resolveExpression('$steps.fetch.output.messages[99]', ctx)).toBeUndefined();
  });

  it('resolves $item[$index] with array item', () => {
    const arrCtx: RuntimeContext = {
      inputs: {},
      steps: {},
      item: ['a', 'b', 'c'],
      index: 1,
    };
    expect(resolveExpression('$item[$index]', arrCtx)).toBe('b');
  });

  it('resolves bracket on non-array to undefined', () => {
    // $inputs.account is a string, not an array
    expect(resolveExpression('$inputs.account[0]', ctx)).toBeUndefined();
  });

  it('resolves bracket on null to undefined', () => {
    expect(resolveExpression('$steps.empty_step.output[0]', ctx)).toBeUndefined();
  });

  // Error cases
  it('throws on unknown reference', () => {
    expect(() => resolveExpression('$unknown', ctx)).toThrow(EvalError);
  });

  // Length on array
  it('resolves .length == 0 on empty array', () => {
    const emptyCtx: RuntimeContext = {
      inputs: {},
      steps: { fetch: { output: { items: [] } } },
    };
    expect(resolveExpression('$steps.fetch.output.items.length == 0', emptyCtx)).toBe(true);
  });
});

// ─── interpolatePrompt tests ──────────────────────────────────────────────────

describe('interpolatePrompt', () => {
  it('interpolates a simple reference', () => {
    const result = interpolatePrompt('Hello $inputs.account', ctx);
    expect(result).toBe('Hello user@example.com');
  });

  it('interpolates multiple references', () => {
    const result = interpolatePrompt(
      'Account: $inputs.account, Threshold: $inputs.threshold',
      ctx,
    );
    expect(result).toBe('Account: user@example.com, Threshold: 7');
  });

  it('serializes arrays as JSON', () => {
    const result = interpolatePrompt('Messages: $steps.fetch.output.messages', ctx);
    expect(result).toContain('[');
    expect(result).toContain('alice@example.com');
  });

  it('serializes objects as JSON', () => {
    const result = interpolatePrompt('Item: $item', iterCtx);
    expect(result).toContain('{');
    expect(result).toContain('alice@example.com');
  });

  it('replaces null with empty string', () => {
    const result = interpolatePrompt('Output: $steps.empty_step.output', ctx);
    expect(result).toBe('Output: ');
  });

  it('leaves unresolvable references as-is', () => {
    const result = interpolatePrompt('Ref: $unknown.field', ctx);
    expect(result).toBe('Ref: $unknown.field');
  });

  it('handles $item and $index in iteration', () => {
    const result = interpolatePrompt('Item $index: $item.subject', iterCtx);
    expect(result).toBe('Item 0: Hello');
  });

  it('preserves text without references', () => {
    const result = interpolatePrompt('No references here.', ctx);
    expect(result).toBe('No references here.');
  });

  it('interpolates bracket indexing', () => {
    const result = interpolatePrompt('Subject: $steps.fetch.output.messages[0].subject', ctx);
    expect(result).toBe('Subject: Hello');
  });

  it('interpolates boolean values', () => {
    const result = interpolatePrompt('Enabled: $inputs.enabled', ctx);
    expect(result).toBe('Enabled: true');
  });
});
