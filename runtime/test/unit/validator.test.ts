import { describe, it, expect } from 'vitest';
import { validateWorkflow, validateWorkflowSkill } from '../../src/validator/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import type { WorkflowDefinition } from '../../src/types/index.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockToolsFor(names: string[]): MockToolAdapter {
  const adapter = new MockToolAdapter();
  for (const name of names) adapter.register(name, () => ({ output: {} }));
  return adapter;
}

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
    const adapter = mockToolsFor(['search']);
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

// ─── delay constraints ────────────────────────────────────────────────────────

describe('validateWorkflow - delay constraints', () => {
  it('rejects delay without each', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'bad_delay',
          type: 'tool',
          tool: 'some_tool',
          delay: '1s',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['some_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('"delay" requires "each"'))).toBe(true);
  });

  it('accepts delay with each', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'ok_delay',
          type: 'tool',
          tool: 'some_tool',
          each: '$inputs.items',
          delay: '500ms',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['some_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
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
              value: '$steps.nonexistent.output.data',
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
              value: '$steps.second.output.data',
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
            data: { type: 'array', value: '$steps.b.output.data' },
          },
          outputs: {},
          expression: { value: '$item' },
        },
        {
          id: 'b',
          type: 'transform',
          operation: 'map',
          inputs: {
            data: { type: 'array', value: '$steps.a.output.data' },
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

// ─── Workflow output source validation ──────────────────────────────────────

describe('validateWorkflow - workflow output source', () => {
  it('accepts valid workflow output source references', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {
        title: { type: 'string', value: '$steps.fetch.output.title' },
      },
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: { title: { type: 'string' } },
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
  });

  it('rejects workflow output source referencing undefined step', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {
        title: { type: 'string', value: '$steps.nonexistent.output.title' },
      },
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.path === 'outputs.title.value' && e.message.includes('nonexistent'),
    )).toBe(true);
  });

  it('accepts workflow outputs without value (key-name pass-through)', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {
        result: { type: 'string' },
      },
      steps: [
        {
          id: 'a',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
  });
});

// ─── Collects all errors ──────────────────────────────────────────────────────

describe('validateWorkflow - collects all errors', () => {
  it('returns multiple errors at once', () => {
    const adapter = mockToolsFor([]);
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
            data: { type: 'array', value: '$steps.nonexistent.output.data' },
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

// ─── Template reference validation (C5) ─────────────────────────────────────

describe('validateWorkflow - template reference validation', () => {
  it('detects undefined step references inside ${...} template strings', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'web.scrape',
          inputs: {
            url: { type: 'string', value: 'https://api.example.com/${steps.nonexistent.output.id}' },
          },
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['web.scrape']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('undefined step "nonexistent"'))).toBe(true);
  });

  it('accepts valid step references inside ${...} template strings', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'get_id',
          type: 'tool',
          tool: 'web.scrape',
          inputs: {},
          outputs: { id: { type: 'string' } },
        },
        {
          id: 'fetch',
          type: 'tool',
          tool: 'web.scrape',
          inputs: {
            url: { type: 'string', value: 'https://api.example.com/${steps.get_id.output.id}' },
          },
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['web.scrape']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
  });
});

// ─── Cycle detection: no false positives with conditional branches (C6) ───────

describe('validateWorkflow - conditional branch cycle detection', () => {
  it('does not report false cycle when branch step references the conditional step output', () => {
    // A conditional step followed by a branch step that references the conditional's
    // upstream data. This is valid — no real cycle exists.
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'web.scrape',
          inputs: {},
          outputs: { score: { type: 'float' } },
        },
        {
          id: 'check',
          type: 'conditional',
          condition: '$steps.fetch.output.score > 5',
          then: ['handle_high'],
          inputs: {},
          outputs: {},
        },
        {
          id: 'handle_high',
          type: 'exit',
          status: 'success',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const adapter = mockToolsFor(['web.scrape']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
    expect(result.errors.filter(e => e.message.includes('Cycle'))).toHaveLength(0);
  });
});

// ─── A3.1: "default" on step inputs (schema-level check) ──────────────────────

describe('validateWorkflow - default on step inputs', () => {
  it('rejects "default" on a step input (parse-level error)', () => {
    // "default" is only valid on workflow inputs; step inputs use "value"
    const content = `
\`\`\`workflow
inputs: {}
outputs: {}
steps:
  - id: fetch
    type: tool
    tool: my_tool
    inputs:
      query:
        type: string
        default: "fallback"
    outputs: {}
\`\`\`
`;
    const result = validateWorkflowSkill({ content });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('"default"'))).toBe(true);
  });

  it('accepts "default" on workflow inputs (not step inputs)', () => {
    const content = `
\`\`\`workflow
inputs:
  query:
    type: string
    default: "fallback"
outputs: {}
steps:
  - id: fetch
    type: tool
    tool: my_tool
    inputs:
      query:
        type: string
        value: $inputs.query
    outputs: {}
\`\`\`
`;
    // No tool adapter → tool check skipped; schema should pass
    const result = validateWorkflowSkill({ content });
    // May fail due to missing tool, but NOT due to "default" error
    const hasDefaultError = result.errors.some(e => e.message.includes('"default"'));
    expect(hasDefaultError).toBe(false);
  });
});

// ─── A3.2: "$result" in workflow output value ─────────────────────────────────

describe('validateWorkflow - $result in workflow output value', () => {
  it('rejects $result in workflow output value', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {
        data: { type: 'array', value: '$result.items' },
      },
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: { items: { type: 'array' } },
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.path === 'outputs.data.value' && e.message.includes('"$result"'),
    )).toBe(true);
  });

  it('accepts $steps references in workflow output value', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {
        data: { type: 'array', value: '$steps.fetch.output.items' },
      },
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: { items: { type: 'array' } },
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
  });
});

// ─── A3.3: "$steps" in step output value ─────────────────────────────────────

describe('validateWorkflow - $steps in step output value', () => {
  it('rejects $steps references in step output value', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: {},
        },
        {
          id: 'process',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: {
            data: { type: 'array', value: '$steps.fetch.output.items' },
          },
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e =>
      e.path.includes('outputs.data.value') && e.message.includes('"$result"'),
    )).toBe(true);
  });

  it('accepts $result references in step output value', () => {
    const wf: WorkflowDefinition = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'fetch',
          type: 'tool',
          tool: 'test_tool',
          inputs: {},
          outputs: {
            data: { type: 'array', value: '$result.items' },
          },
        },
      ],
    };
    const adapter = mockToolsFor(['test_tool']);
    const result = validateWorkflow(wf, adapter);
    expect(result.valid).toBe(true);
  });
});
