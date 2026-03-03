import { describe, it, expect } from 'vitest';
import { readFixture } from '../helpers.js';
import { parseSkillMd, parseWorkflowYaml, ParseError } from '../../src/parser/index.js';

// ─── Parse full SKILL.md tests ────────────────────────────────────────────────

describe('parseSkillMd', () => {
  it('parses echo workflow', () => {
    const result = parseSkillMd(readFixture('echo.md'));
    expect(result.frontmatter.name).toBe('echo');
    expect(result.workflow.steps).toHaveLength(1);
    expect(result.workflow.steps[0]!.id).toBe('echo');
    expect(result.workflow.steps[0]!.type).toBe('transform');
  });

  it('parses branch workflow', () => {
    const result = parseSkillMd(readFixture('branch.md'));
    const condStep = result.workflow.steps[1]!;
    expect(condStep.type).toBe('conditional');
    if (condStep.type === 'conditional') {
      expect(condStep.then).toEqual(['exit_success']);
      expect(condStep.else).toEqual(['exit_failed']);
    }
  });

  it('parses each-loop workflow', () => {
    const result = parseSkillMd(readFixture('each-loop.md'));
    const eachStep = result.workflow.steps[1]!;
    expect(eachStep.each).toBe('$steps.fetch.output.documents');
    expect(eachStep.type).toBe('tool');
  });
});

// ─── Error case tests ─────────────────────────────────────────────────────────

describe('parseSkillMd error cases', () => {
  it('throws on missing workflow block', () => {
    expect(() => parseSkillMd(readFixture('malformed-no-block.md'))).toThrow(ParseError);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseSkillMd(readFixture('malformed-bad-yaml.md'))).toThrow(ParseError);
  });

  it('throws on invalid schema with details', () => {
    expect.assertions(2);
    try {
      parseSkillMd(readFixture('malformed-bad-schema.md'));
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      const parseErr = err as ParseError;
      expect(parseErr.details.length).toBeGreaterThan(0);
    }
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseSkillMd(readFixture('malformed-no-frontmatter.md'))).toThrow(ParseError);
  });
});

// ─── parseWorkflowYaml tests ──────────────────────────────────────────────────

describe('parseWorkflowYaml', () => {
  it('parses raw YAML string', () => {
    const yaml = `
steps:
  - id: test
    type: tool
    tool: my_tool
    inputs:
      x:
        type: string
    outputs:
      y:
        type: string
`;
    const result = parseWorkflowYaml(yaml);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.id).toBe('test');
  });

  it('throws on empty steps', () => {
    expect(() => parseWorkflowYaml('steps: []')).toThrow(ParseError);
  });
});

// ─── Output source parsing ───────────────────────────────────────────────────

describe('value field (unified source/default)', () => {
  it('parses value on step outputs', () => {
    const yaml = `
steps:
  - id: fetch
    type: tool
    tool: web.scrape
    inputs:
      url: { type: string, value: "https://example.com" }
    outputs:
      title:
        type: string
        value: $result.body.title
`;
    const result = parseWorkflowYaml(yaml);
    const step = result.steps[0]!;
    expect(step.outputs.title).toEqual({ type: 'string', value: '$result.body.title' });
  });

  it('parses value on workflow outputs', () => {
    const yaml = `
outputs:
  name:
    type: string
    value: $steps.fetch.output.name
steps:
  - id: fetch
    type: tool
    tool: some.tool
    inputs: {}
    outputs:
      name: { type: string }
`;
    const result = parseWorkflowYaml(yaml);
    expect(result.outputs.name).toEqual({ type: 'string', value: '$steps.fetch.output.name' });
  });

  it('parses output-source fixture', () => {
    const content = readFixture('output-source.md');
    const result = parseSkillMd(content);
    expect(result.workflow.outputs.title).toEqual({ type: 'string', value: '$steps.fetch.output.title' });
    expect(result.workflow.outputs.author).toEqual({ type: 'string', value: '$steps.fetch.output.author' });
    const step = result.workflow.steps[0]!;
    expect(step.outputs.title).toEqual({ type: 'string', value: '$result.results[0].title' });
    expect(step.outputs.author).toEqual({ type: 'string', value: '$result.results[0].author' });
  });

  it('parses default on workflow inputs (canonical field)', () => {
    const yaml = `
inputs:
  method:
    type: string
    default: "GET"
steps:
  - id: fetch
    type: tool
    tool: web.scrape
    inputs:
      method: { type: string, value: "POST" }
    outputs: {}
`;
    const result = parseWorkflowYaml(yaml);
    expect(result.inputs.method).toEqual({ type: 'string', default: 'GET' });
    const step = result.steps[0]!;
    expect(step.inputs.method).toEqual({ type: 'string', value: 'POST' });
  });

});
