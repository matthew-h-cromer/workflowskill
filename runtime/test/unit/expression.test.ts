import { describe, it, expect } from 'vitest';
import { resolveExpression, resolveTemplate, containsTemplate, EvalError } from '../../src/expression/index.js';
import type { RuntimeContext } from '../../src/types/index.js';

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

  // contains operator
  it('contains: string substring match (true)', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { title: 'Senior Product Manager' } };
    expect(resolveExpression('$item.title contains "Product Manager"', c)).toBe(true);
  });

  it('contains: string substring non-match (false)', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { title: 'Software Engineer' } };
    expect(resolveExpression('$item.title contains "Product Manager"', c)).toBe(false);
  });

  it('contains: string substring is case-sensitive', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { title: 'Senior Product Manager' } };
    expect(resolveExpression('$item.title contains "product manager"', c)).toBe(false);
  });

  it('contains: empty string is always contained', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { title: 'Anything' } };
    expect(resolveExpression('$item.title contains ""', c)).toBe(true);
  });

  it('contains: null/undefined LHS returns false', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { title: null } };
    expect(resolveExpression('$item.title contains "Manager"', c)).toBe(false);
  });

  it('contains: array membership (true)', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { tags: ['urgent', 'billing'] } };
    expect(resolveExpression('$item.tags contains "urgent"', c)).toBe(true);
  });

  it('contains: array membership (false)', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { tags: ['urgent', 'billing'] } };
    expect(resolveExpression('$item.tags contains "low"', c)).toBe(false);
  });

  it('contains: array membership with number', () => {
    const c: RuntimeContext = { inputs: {}, steps: {}, item: { ids: [41, 42, 43] } };
    expect(resolveExpression('$item.ids contains 42', c)).toBe(true);
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

// ─── containsTemplate tests ───────────────────────────────────────────────────

describe('containsTemplate', () => {
  it('returns true for a ${} block', () => {
    expect(containsTemplate('${inputs.query}')).toBe(true);
  });

  it('returns true for template inside a string', () => {
    expect(containsTemplate('https://example.com?q=${inputs.query}')).toBe(true);
  });

  it('returns false for a bare $-reference', () => {
    expect(containsTemplate('$inputs.query')).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(containsTemplate('GET')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsTemplate('')).toBe(false);
  });
});

// ─── resolveTemplate tests ────────────────────────────────────────────────────

describe('resolveTemplate', () => {
  it('preserves type for whole-value ${ref}', () => {
    expect(resolveTemplate('${inputs.threshold}', ctx)).toBe(7);
  });

  it('preserves array type for whole-value ${ref}', () => {
    const result = resolveTemplate('${steps.fetch.output.messages}', ctx);
    expect(Array.isArray(result)).toBe(true);
  });

  it('interpolates multiple ${} blocks into a string', () => {
    const urlCtx: RuntimeContext = {
      inputs: { base: 'https://api.example.com/item/' },
      steps: {},
      item: 101,
    };
    expect(resolveTemplate('${inputs.base}${item}.json', urlCtx)).toBe(
      'https://api.example.com/item/101.json',
    );
  });

  it('interpolates a ${} block with surrounding text', () => {
    expect(resolveTemplate('https://example.com?q=${inputs.account}', ctx)).toBe(
      'https://example.com?q=user@example.com',
    );
  });

  it('coerces number to string in multi-block template', () => {
    expect(resolveTemplate('limit=${inputs.threshold}', ctx)).toBe('limit=7');
  });

  it('coerces null to empty string in multi-block template', () => {
    expect(resolveTemplate('val=${steps.empty_step.output}', ctx)).toBe('val=');
  });

  it('resolves nested property access inside ${}', () => {
    expect(resolveTemplate('subject=${steps.fetch.output.messages[0].subject}', ctx)).toBe(
      'subject=Hello',
    );
  });

  it('escapes $${ to literal ${', () => {
    expect(resolveTemplate('prefix$${literal}suffix', ctx)).toBe('prefix${literal}suffix');
  });

  it('throws on unknown reference inside ${}', () => {
    expect(() => resolveTemplate('${unknown.field}', ctx)).toThrow(EvalError);
  });
});
