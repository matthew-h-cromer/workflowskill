import { describe, it, expect } from 'vitest';
import { readFixture } from '../helpers.js';
import { validateWorkflowSkill } from '../../src/validator/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';

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
    expect(result.stepTypes).toContain('conditional');
    expect(result.stepTypes).toContain('exit');
  });

  it('validates without toolAdapter (skips tool checks)', () => {
    const result = validateWorkflowSkill({ content: readFixture('two-step-pipe.md') });
    expect(result.valid).toBe(true);
  });

  it('validates with toolAdapter that has required tools', () => {
    const toolAdapter = new MockToolAdapter();
    toolAdapter.register('search', () => ({ output: {} }));
    toolAdapter.register('gmail_fetch', () => ({ output: {} }));
    const result = validateWorkflowSkill({
      content: readFixture('two-step-pipe.md'),
      toolAdapter,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateWorkflowSkill - parse failures', () => {
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
