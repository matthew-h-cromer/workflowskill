import { describe, it, expect } from 'vitest';
import type {
  TransformFilterStep,
  TransformMapStep,
  TransformSortStep,
  ConditionalStep,
  ExitStep,
  ToolStep,
  RuntimeContext,
} from '../../src/types/index.js';
import { executeTransform } from '../../src/executor/transform.js';
import { executeConditional } from '../../src/executor/conditional.js';
import { executeExit } from '../../src/executor/exit.js';
import { executeTool } from '../../src/executor/tool.js';
import { StepExecutionError } from '../../src/executor/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    inputs: {},
    steps: {},
    ...overrides,
  };
}

function makeStep<T>(overrides: T): T {
  return {
    inputs: {},
    outputs: {},
    ...overrides,
  };
}

// ─── Transform executor ──────────────────────────────────────────────────────

describe('Transform executor', () => {
  describe('filter', () => {
    const step = makeStep<TransformFilterStep>({
      id: 'filter_high',
      type: 'transform',
      operation: 'filter',
      where: '$item.score >= 7',
      inputs: { items: { type: 'array' } },
      outputs: { filtered: { type: 'array' } },
    });

    it('keeps items matching the where expression', () => {
      const items = [
        { name: 'a', score: 9 },
        { name: 'b', score: 3 },
        { name: 'c', score: 7 },
      ];
      const result = executeTransform(step, { items }, baseContext());
      expect(result).toEqual({
        filtered: [
          { name: 'a', score: 9 },
          { name: 'c', score: 7 },
        ],
      });
    });

    it('returns empty array when nothing matches', () => {
      const items = [{ score: 1 }, { score: 2 }];
      const result = executeTransform(step, { items }, baseContext());
      expect(result).toEqual({ filtered: [] });
    });

    it('filters with $inputs reference in where clause', () => {
      const filterStep = makeStep<TransformFilterStep>({
        id: 'f',
        type: 'transform',
        operation: 'filter',
        where: '$item.score >= $inputs.threshold',
        inputs: { items: { type: 'array' } },
        outputs: { filtered: { type: 'array' } },
      });
      const items = [{ score: 5 }, { score: 10 }, { score: 3 }];
      const ctx = baseContext({ inputs: { threshold: 5 } });
      const result = executeTransform(filterStep, { items }, ctx);
      expect(result).toEqual({
        filtered: [{ score: 5 }, { score: 10 }],
      });
    });
  });

  describe('map', () => {
    const step = makeStep<TransformMapStep>({
      id: 'reshape',
      type: 'transform',
      operation: 'map',
      expression: { title: '$item.name', active: '$item.enabled' },
      inputs: { items: { type: 'array' } },
      outputs: { mapped: { type: 'array' } },
    });

    it('projects items into new shape', () => {
      const items = [
        { name: 'Alice', enabled: true },
        { name: 'Bob', enabled: false },
      ];
      const result = executeTransform(step, { items }, baseContext());
      expect(result).toEqual({
        mapped: [
          { title: 'Alice', active: true },
          { title: 'Bob', active: false },
        ],
      });
    });

    it('wraps single non-array input in array', () => {
      const echoStep = makeStep<TransformMapStep>({
        id: 'echo',
        type: 'transform',
        operation: 'map',
        expression: { value: '$item' },
        inputs: { data: { type: 'string' } },
        outputs: { mapped: { type: 'string' } },
      });
      const result = executeTransform(echoStep, { data: 'hello' }, baseContext());
      expect(result).toEqual({ mapped: [{ value: 'hello' }] });
    });

    it('handles literal (non-expression) values', () => {
      const literalStep = makeStep<TransformMapStep>({
        id: 'lit',
        type: 'transform',
        operation: 'map',
        expression: { name: '$item.name', kind: 'user' },
        inputs: { items: { type: 'array' } },
        outputs: { mapped: { type: 'array' } },
      });
      const result = executeTransform(literalStep, { items: [{ name: 'A' }] }, baseContext());
      expect(result).toEqual({ mapped: [{ name: 'A', kind: 'user' }] });
    });
  });

  describe('sort', () => {
    const items = [
      { name: 'C', score: 3 },
      { name: 'A', score: 9 },
      { name: 'B', score: 5 },
    ];

    it('sorts ascending by default', () => {
      const step = makeStep<TransformSortStep>({
        id: 'sort',
        type: 'transform',
        operation: 'sort',
        field: 'score',
        inputs: { items: { type: 'array' } },
        outputs: { sorted: { type: 'array' } },
      });
      const result = executeTransform(step, { items }, baseContext());
      expect(result).toEqual({
        sorted: [
          { name: 'C', score: 3 },
          { name: 'B', score: 5 },
          { name: 'A', score: 9 },
        ],
      });
    });

    it('sorts descending when specified', () => {
      const step = makeStep<TransformSortStep>({
        id: 'sort',
        type: 'transform',
        operation: 'sort',
        field: 'score',
        direction: 'desc',
        inputs: { items: { type: 'array' } },
        outputs: { sorted: { type: 'array' } },
      });
      const result = executeTransform(step, { items }, baseContext());
      expect(result).toEqual({
        sorted: [
          { name: 'A', score: 9 },
          { name: 'B', score: 5 },
          { name: 'C', score: 3 },
        ],
      });
    });

    it('sorts by nested field', () => {
      const step = makeStep<TransformSortStep>({
        id: 'sort',
        type: 'transform',
        operation: 'sort',
        field: 'user.age',
        inputs: { items: { type: 'array' } },
        outputs: { sorted: { type: 'array' } },
      });
      const data = [
        { user: { age: 30 } },
        { user: { age: 20 } },
        { user: { age: 25 } },
      ];
      const result = executeTransform(step, { items: data }, baseContext());
      expect(result).toEqual({
        sorted: [
          { user: { age: 20 } },
          { user: { age: 25 } },
          { user: { age: 30 } },
        ],
      });
    });

    it('does not mutate original array', () => {
      const step = makeStep<TransformSortStep>({
        id: 'sort',
        type: 'transform',
        operation: 'sort',
        field: 'score',
        inputs: { items: { type: 'array' } },
        outputs: { sorted: { type: 'array' } },
      });
      const original = [...items];
      executeTransform(step, { items }, baseContext());
      expect(items).toEqual(original);
    });
  });
});

// ─── Conditional executor ─────────────────────────────────────────────────────

describe('Conditional executor', () => {
  it('returns then branch when condition is true', () => {
    const step = makeStep<ConditionalStep>({
      id: 'branch',
      type: 'conditional',
      condition: '$inputs.value > 5',
      then: ['step_a', 'step_b'],
      else: ['step_c'],
      inputs: {},
      outputs: {},
    });
    const ctx = baseContext({ inputs: { value: 10 } });
    const result = executeConditional(step, ctx);
    expect(result).toEqual({ branch: 'then', stepIds: ['step_a', 'step_b'] });
  });

  it('returns else branch when condition is false', () => {
    const step = makeStep<ConditionalStep>({
      id: 'branch',
      type: 'conditional',
      condition: '$inputs.value > 5',
      then: ['step_a'],
      else: ['step_c'],
      inputs: {},
      outputs: {},
    });
    const ctx = baseContext({ inputs: { value: 2 } });
    const result = executeConditional(step, ctx);
    expect(result).toEqual({ branch: 'else', stepIds: ['step_c'] });
  });

  it('returns null branch when condition is false and no else defined', () => {
    const step = makeStep<ConditionalStep>({
      id: 'branch',
      type: 'conditional',
      condition: '$inputs.value > 5',
      then: ['step_a'],
      inputs: {},
      outputs: {},
    });
    const ctx = baseContext({ inputs: { value: 2 } });
    const result = executeConditional(step, ctx);
    expect(result).toEqual({ branch: null, stepIds: [] });
  });

  it('evaluates $steps references in condition', () => {
    const step = makeStep<ConditionalStep>({
      id: 'branch',
      type: 'conditional',
      condition: '$steps.check.output.valid == true',
      then: ['success'],
      else: ['failure'],
      inputs: {},
      outputs: {},
    });
    const ctx = baseContext({
      steps: { check: { output: { valid: true } } },
    });
    const result = executeConditional(step, ctx);
    expect(result.branch).toBe('then');
  });
});

// ─── Exit executor ──────────────────────────────────────────────────────────

describe('Exit executor', () => {
  it('returns status and resolved output', () => {
    const step = makeStep<ExitStep>({
      id: 'done',
      type: 'exit',
      status: 'success',
      output: '$steps.process.output.result',
      inputs: {},
      outputs: {},
    });
    const ctx = baseContext({
      steps: { process: { output: { result: 'all good' } } },
    });
    const result = executeExit(step, ctx);
    expect(result).toEqual({ status: 'success', output: 'all good' });
  });

  it('returns null output when no output expression', () => {
    const step = makeStep<ExitStep>({
      id: 'done',
      type: 'exit',
      status: 'failed',
      inputs: {},
      outputs: {},
    });
    const result = executeExit(step, baseContext());
    expect(result).toEqual({ status: 'failed', output: null });
  });
});

// ─── Tool executor ──────────────────────────────────────────────────────────

describe('Tool executor', () => {
  it('invokes tool and returns output', async () => {
    const step = makeStep<ToolStep>({
      id: 'search',
      type: 'tool',
      tool: 'web_search',
      inputs: { query: { type: 'string' } },
      outputs: { results: { type: 'array' } },
    });
    const adapter = new MockToolAdapter();
    adapter.register('web_search', (args) => ({
      output: { results: [{ title: `Result for ${args.query}` }] },
    }));
    const result = await executeTool(step, { query: 'test' }, adapter);
    expect(result.output).toEqual({ results: [{ title: 'Result for test' }] });
  });

  it('throws StepExecutionError on tool error', async () => {
    const step = makeStep<ToolStep>({
      id: 'failing',
      type: 'tool',
      tool: 'bad_api',
      inputs: {},
      outputs: {},
    });
    const adapter = new MockToolAdapter();
    adapter.register('bad_api', () => ({
      output: null,
      error: 'Connection refused',
    }));
    await expect(executeTool(step, {}, adapter)).rejects.toThrow(StepExecutionError);
    await expect(executeTool(step, {}, adapter)).rejects.toThrow('Connection refused');
  });

  it('marks tool errors as retriable', async () => {
    expect.assertions(2);
    const step = makeStep<ToolStep>({
      id: 'failing',
      type: 'tool',
      tool: 'bad_api',
      inputs: {},
      outputs: {},
    });
    const adapter = new MockToolAdapter();
    adapter.register('bad_api', () => ({
      output: null,
      error: 'Timeout',
    }));
    try {
      await executeTool(step, {}, adapter);
    } catch (e) {
      expect(e).toBeInstanceOf(StepExecutionError);
      expect((e as StepExecutionError).retriable).toBe(true);
    }
  });

  it('includes tool name in error context', async () => {
    expect.assertions(3);
    const step = makeStep<ToolStep>({
      id: 'failing',
      type: 'tool',
      tool: 'my_api',
      inputs: {},
      outputs: {},
    });
    const adapter = new MockToolAdapter();
    adapter.register('my_api', () => ({
      output: null,
      error: 'Not found',
    }));
    try {
      await executeTool(step, {}, adapter);
    } catch (e) {
      expect(e).toBeInstanceOf(StepExecutionError);
      const err = e as StepExecutionError;
      expect(err.context).toBeDefined();
      expect(err.context!.tool).toBe('my_api');
    }
  });
});
