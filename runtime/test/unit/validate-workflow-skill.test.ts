import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorkflowSkill } from '../../src/validator/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import type { ToolAdapter, ToolResult } from '../../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

// A tool adapter that knows about a set of tools
class StubToolAdapter implements ToolAdapter {
  constructor(private readonly tools: string[]) {}
  has(name: string): boolean { return this.tools.includes(name); }
  async invoke(_name: string, _args: Record<string, unknown>): Promise<ToolResult> {
    return { output: {} };
  }
}

describe('validateWorkflowSkill - valid content', () => {
  it('validates a full SKILL.md', () => {
    const result = validateWorkflowSkill({ content: readFixture('echo.md') });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.name).toBe('echo');
    expect(result.stepCount).toBe(1);
    expect(result.stepTypes).toContain('transform');
  });

  it('validates a bare workflow block (no frontmatter)', () => {
    const result = validateWorkflowSkill({ content: readFixture('malformed-no-frontmatter.md') });
    expect(result.valid).toBe(true);
    expect(result.name).toBeUndefined();
    expect(result.stepCount).toBe(1);
  });

  it('includes all unique step types', () => {
    const result = validateWorkflowSkill({ content: readFixture('branch.md') });
    expect(result.valid).toBe(true);
    expect(result.stepTypes).toBeDefined();
    expect(result.stepTypes!.length).toBeGreaterThan(0);
  });

  it('validates without toolAdapter (skips tool checks)', () => {
    const result = validateWorkflowSkill({ content: readFixture('two-step-pipe.md') });
    expect(result.valid).toBe(true);
  });

  it('validates with toolAdapter that has required tools', () => {
    const toolAdapter = new StubToolAdapter(['search', 'gmail_fetch']);
    const result = validateWorkflowSkill({
      content: readFixture('two-step-pipe.md'),
      toolAdapter,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateWorkflowSkill - tool availability', () => {
  it('returns invalid when tool is not registered', () => {
    const toolAdapter = new MockToolAdapter();
    // two-step-pipe uses tools; MockToolAdapter has none registered
    const result = validateWorkflowSkill({
      content: readFixture('two-step-pipe.md'),
      toolAdapter,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes('not registered'))).toBe(true);
  });
});

describe('validateWorkflowSkill - parse failures', () => {
  it('returns invalid for empty content', () => {
    const result = validateWorkflowSkill({ content: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid for content with no workflow block', () => {
    const result = validateWorkflowSkill({ content: readFixture('malformed-no-block.md') });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid for malformed YAML', () => {
    const result = validateWorkflowSkill({ content: readFixture('malformed-bad-yaml.md') });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid for bad schema with error details', () => {
    const result = validateWorkflowSkill({ content: readFixture('malformed-bad-schema.md') });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Schema errors should have path information
    expect(result.errors[0]).toHaveProperty('path');
    expect(result.errors[0]).toHaveProperty('message');
  });
});

describe('validateWorkflowSkill - schema errors', () => {
  it('returns schema validation errors from validateWorkflow', () => {
    // A workflow with a self-reference (forward ref) would fail validation
    const content = `
\`\`\`workflow
inputs: {}
outputs: {}
steps:
  - id: step_a
    type: transform
    operation: map
    inputs:
      data:
        type: array
        value: $steps.step_b.output
    outputs: {}
    expression:
      value: $item
  - id: step_b
    type: transform
    operation: map
    inputs: {}
    outputs: {}
    expression:
      value: $item
\`\`\`
`;
    const result = validateWorkflowSkill({ content });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not declared before it'))).toBe(true);
  });
});
