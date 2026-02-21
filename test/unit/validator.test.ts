import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorkflow } from '../../src/validator/index.js';
import { parseWorkflowFromMd } from '../../src/parser/index.js';
import type { WorkflowDefinition, ToolAdapter, ToolResult } from '../../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');
const parseFixture = (name: string) => parseWorkflowFromMd(readFixture(name));

// ─── Mock tool adapter ────────────────────────────────────────────────────────

class MockToolAdapter implements ToolAdapter {
  private tools: Set<string>;

  constructor(toolNames: string[]) {
    this.tools = new Set(toolNames);
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  async invoke(_toolName: string, _args: Record<string, unknown>): Promise<ToolResult> {
    return { output: {} };
  }
}

// ─── Valid workflow tests ─────────────────────────────────────────────────────

describe('validateWorkflow - valid workflows', () => {
  const allTools = new MockToolAdapter([
    'search', 'gmail_fetch', 'get_items', 'validate', 'get_documents',
    'unreliable_api', 'flaky_api', 'get_records',
  ]);

  it('validates echo workflow', () => {
    const result = validateWorkflow(parseFixture('echo.md'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates two-step-pipe workflow', () => {
    const result = validateWorkflow(parseFixture('two-step-pipe.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates llm-judgment workflow', () => {
    const result = validateWorkflow(parseFixture('llm-judgment.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates filter-exit workflow', () => {
    const result = validateWorkflow(parseFixture('filter-exit.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates branch workflow', () => {
    const result = validateWorkflow(parseFixture('branch.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates each-loop workflow', () => {
    const result = validateWorkflow(parseFixture('each-loop.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates error-fail workflow', () => {
    const result = validateWorkflow(parseFixture('error-fail.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates error-ignore workflow', () => {
    const result = validateWorkflow(parseFixture('error-ignore.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates retry-backoff workflow', () => {
    const result = validateWorkflow(parseFixture('retry-backoff.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates sort-pipeline workflow', () => {
    const result = validateWorkflow(parseFixture('sort-pipeline.md'), allTools);
    expect(result.valid).toBe(true);
  });

  it('validates without tool adapter (skips tool checks)', () => {
    const result = validateWorkflow(parseFixture('two-step-pipe.md'));
    expect(result.valid).toBe(true);
  });
});

// ─── Duplicate ID tests ──────────────────────────────────────────────────────

describe('validateWorkflow - duplicate step IDs', () => {
  it('detects duplicate step IDs', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'step1',
          type: 'transform',
          operation: 'map',
          inputs: {},
          outputs: {},
          expression: { value: '$item' },
        },
        {
          id: 'step1',
          type: 'transform',
          operation: 'map',
          inputs: {},
          outputs: {},
          expression: { value: '$item' },
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate step ID'))).toBe(true);
  });
});

// ─── Tool availability tests ──────────────────────────────────────────────────

describe('validateWorkflow - tool availability', () => {
  it('detects missing tools', () => {
    const adapter = new MockToolAdapter(['search']);
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'nonexistent_tool',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('not registered'))).toBe(true);
  });
});

// ─── each on exit/conditional tests ───────────────────────────────────────────

describe('validateWorkflow - each constraints', () => {
  it('rejects each on exit steps', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'bad_exit',
          type: 'exit',
          status: 'success',
          each: '$inputs.items',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('not valid on exit'))).toBe(true);
  });

  it('rejects each on conditional steps', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'bad_cond',
          type: 'conditional',
          condition: 'true',
          then: ['some_step'],
          each: '$inputs.items',
          inputs: {},
          outputs: {},
        },
        {
          id: 'some_step',
          type: 'exit',
          status: 'success',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('not valid on conditional'))).toBe(true);
  });
});

// ─── Reference validation tests ───────────────────────────────────────────────

describe('validateWorkflow - reference validation', () => {
  it('detects references to undefined steps', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'process',
          type: 'transform',
          operation: 'map',
          inputs: {
            data: {
              type: 'array',
              source: '$steps.nonexistent.output.data',
            },
          },
          outputs: {},
          expression: { value: '$item' },
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('undefined step "nonexistent"'))).toBe(true);
  });

  it('detects forward references (step references step declared after it)', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'first',
          type: 'transform',
          operation: 'map',
          inputs: {
            data: {
              type: 'array',
              source: '$steps.second.output.data',
            },
          },
          outputs: {},
          expression: { value: '$item' },
        },
        {
          id: 'second',
          type: 'transform',
          operation: 'map',
          inputs: {},
          outputs: {},
          expression: { value: '$item' },
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('not declared before it'))).toBe(true);
  });

  it('detects undefined step in conditional then branch', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'branch',
          type: 'conditional',
          condition: 'true',
          then: ['nonexistent_step'],
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Branch references undefined step'))).toBe(true);
  });

  it('detects undefined step in conditional else branch', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'ok_step',
          type: 'exit',
          status: 'success',
          inputs: {},
          outputs: {},
        },
        {
          id: 'branch',
          type: 'conditional',
          condition: 'true',
          then: ['ok_step'],
          else: ['missing_step'],
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.path.includes('else') && e.message.includes('Branch references undefined step'),
    )).toBe(true);
  });
});

// ─── Cycle detection tests ────────────────────────────────────────────────────

describe('validateWorkflow - cycle detection', () => {
  it('detects direct cycle (A→B→A)', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'a',
          type: 'transform',
          operation: 'map',
          inputs: {
            data: { type: 'array', source: '$steps.b.output.data' },
          },
          outputs: {},
          expression: { value: '$item' },
        },
        {
          id: 'b',
          type: 'transform',
          operation: 'map',
          inputs: {
            data: { type: 'array', source: '$steps.a.output.data' },
          },
          outputs: {},
          expression: { value: '$item' },
        },
      ],
    };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Cycle detected'))).toBe(true);
  });
});

// ─── Collects all errors ──────────────────────────────────────────────────────

describe('validateWorkflow - collects all errors', () => {
  it('returns multiple errors at once', () => {
    const adapter = new MockToolAdapter([]);
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'bad_tool',
          type: 'tool',
          tool: 'missing_tool_1',
          inputs: {},
          outputs: {},
        },
        {
          id: 'bad_tool_2',
          type: 'tool',
          tool: 'missing_tool_2',
          inputs: {
            data: { type: 'array', source: '$steps.nonexistent.output.data' },
          },
          outputs: {},
        },
        {
          id: 'bad_exit',
          type: 'exit',
          status: 'success',
          each: '$inputs.items',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    // Should have at least 4 errors: 2 missing tools, 1 undefined ref, 1 each on exit
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
