import { describe, it, expect } from 'vitest';
import type {
  WorkflowDefinition,
  ToolStep,
  LLMStep,
  TransformFilterStep,
  TransformMapStep,
  TransformSortStep,
  ConditionalStep,
  ExitStep,
  Step,
  RunLog,
  RuntimeContext,
  ValidationResult,
  JsonSchema,
  ToolDescriptor,
  ToolAdapter,
  ToolResult,
} from '../../src/types/index.js';

describe('types', () => {
  it('WorkflowDefinition is structurally sound', () => {
    const wf: WorkflowDefinition = {
      inputs: {
        messages: { type: 'array', items: { type: 'object' } },
      },
      outputs: {
        result: { type: 'string' },
      },
      steps: [],
    };
    expect(wf.inputs.messages?.type).toBe('array');
    expect(wf.outputs.result?.type).toBe('string');
  });

  it('all step types are assignable to Step union', () => {
    const toolStep: ToolStep = {
      id: 'fetch',
      type: 'tool',
      tool: 'gmail_fetch',
      inputs: { account: { type: 'string', value: '$inputs.account' } },
      outputs: { messages: { type: 'array' } },
    };

    const llmStep: LLMStep = {
      id: 'score',
      type: 'llm',
      prompt: 'Score this: $steps.fetch.output.messages',
      inputs: { messages: { type: 'array', value: '$steps.fetch.output.messages' } },
      outputs: { scored: { type: 'array' } },
    };

    const filterStep: TransformFilterStep = {
      id: 'filter_high',
      type: 'transform',
      operation: 'filter',
      where: '$item.score >= 7',
      inputs: { items: { type: 'array', value: '$steps.score.output.scored' } },
      outputs: { filtered: { type: 'array' } },
    };

    const mapStep: TransformMapStep = {
      id: 'reshape',
      type: 'transform',
      operation: 'map',
      expression: { summary: '$item.text' },
      inputs: { items: { type: 'array', value: '$steps.filter_high.output.filtered' } },
      outputs: { mapped: { type: 'array' } },
    };

    const sortStep: TransformSortStep = {
      id: 'order',
      type: 'transform',
      operation: 'sort',
      field: 'score',
      direction: 'desc',
      inputs: { items: { type: 'array', value: '$steps.reshape.output.mapped' } },
      outputs: { sorted: { type: 'array' } },
    };

    const conditionalStep: ConditionalStep = {
      id: 'check',
      type: 'conditional',
      condition: '$steps.filter_high.output.filtered.length > 0',
      then: ['notify'],
      else: ['skip_notify'],
      inputs: {},
      outputs: {},
    };

    const exitStep: ExitStep = {
      id: 'done',
      type: 'exit',
      status: 'success',
      output: '$steps.order.output.sorted',
      inputs: {},
      outputs: {},
    };

    // All types assignable to Step union
    const steps: Step[] = [toolStep, llmStep, filterStep, mapStep, sortStep, conditionalStep, exitStep];
    expect(steps).toHaveLength(7);
  });

  it('RunLog has all required fields', () => {
    const log: RunLog = {
      id: 'run-123',
      workflow: 'test-workflow',
      status: 'success',
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:00:01Z',
      duration_ms: 1000,
      inputs: { account: 'user@example.com' },
      outputs: { result: [] },
      steps: [
        {
          id: 'fetch',
          executor: 'tool',
          status: 'success',
          duration_ms: 500,
          output: { messages: [] },
        },
        {
          id: 'score',
          executor: 'llm',
          status: 'success',
          duration_ms: 400,
          tokens: { input: 100, output: 50 },
          output: { scored: [] },
        },
        {
          id: 'skipped_step',
          executor: 'transform',
          status: 'skipped',
          reason: 'guard condition was false',
          duration_ms: 0,
        },
      ],
      summary: {
        steps_executed: 2,
        steps_skipped: 1,
        total_tokens: 150,
        total_duration_ms: 1000,
      },
    };
    expect(log.steps).toHaveLength(3);
    expect(log.summary.total_tokens).toBe(150);
  });

  it('RuntimeContext supports iteration context', () => {
    const ctx: RuntimeContext = {
      inputs: { threshold: 7 },
      steps: {
        fetch: { output: { messages: ['a', 'b'] } },
      },
      item: { text: 'hello', score: 8 },
      index: 0,
    };
    expect(ctx.item).toBeDefined();
    expect(ctx.index).toBe(0);
  });

  it('ValidationResult collects multiple errors', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        { path: 'steps[0].tool', message: 'Tool "nonexistent" is not registered' },
        { path: 'steps[1].inputs.data', message: 'Source references undefined step "missing"' },
      ],
    };
    expect(result.errors).toHaveLength(2);
  });

  it('ToolDescriptor compiles with full fields', () => {
    const descriptor: ToolDescriptor = {
      name: 'gmail.search',
      description: 'Search Gmail messages',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'integer' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'array',
        items: { type: 'object' },
      },
    };
    expect(descriptor.name).toBe('gmail.search');
    expect(descriptor.inputSchema?.properties?.query?.type).toBe('string');
  });

  it('ToolDescriptor compiles with minimal fields', () => {
    const descriptor: ToolDescriptor = {
      name: 'simple_tool',
      description: 'A simple tool',
    };
    expect(descriptor.inputSchema).toBeUndefined();
    expect(descriptor.outputSchema).toBeUndefined();
  });

  it('JsonSchema supports nested properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
          },
          required: ['name'],
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['user'],
    };
    expect(schema.properties?.user?.properties?.name?.type).toBe('string');
    expect(schema.properties?.tags?.items?.type).toBe('string');
  });

  it('ToolAdapter without list() still satisfies the interface', () => {
    const adapter: ToolAdapter = {
      has: (_name: string) => false,
      invoke: async (_name: string, _args: Record<string, unknown>): Promise<ToolResult> => {
        return { output: null };
      },
    };
    expect(adapter.has('anything')).toBe(false);
  });
});
