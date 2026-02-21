import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillMd, parseWorkflowYaml, parseWorkflowFromMd, ParseError } from '../../src/parser/index.js';
import { extractWorkflowBlock, extractFrontmatter, ExtractError } from '../../src/parser/extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

// ─── Extract tests ────────────────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  it('extracts YAML frontmatter', () => {
    const content = readFixture('echo.md');
    const fm = extractFrontmatter(content);
    expect(fm).toContain('name: echo');
    expect(fm).toContain('description:');
  });

  it('returns null when no frontmatter', () => {
    const fm = extractFrontmatter('# No frontmatter\nJust content.');
    expect(fm).toBeNull();
  });
});

describe('extractWorkflowBlock', () => {
  it('extracts workflow YAML block', () => {
    const content = readFixture('echo.md');
    const yaml = extractWorkflowBlock(content);
    expect(yaml).toContain('steps:');
    expect(yaml).toContain('id: echo');
  });

  it('throws on missing workflow block', () => {
    expect(() => extractWorkflowBlock('# No block')).toThrow(ExtractError);
  });
});

// ─── Parse full SKILL.md tests ────────────────────────────────────────────────

describe('parseSkillMd', () => {
  it('parses echo workflow', () => {
    const result = parseSkillMd(readFixture('echo.md'));
    expect(result.frontmatter.name).toBe('echo');
    expect(result.workflow.steps).toHaveLength(1);
    expect(result.workflow.steps[0]!.id).toBe('echo');
    expect(result.workflow.steps[0]!.type).toBe('transform');
  });

  it('parses two-step-pipe workflow', () => {
    const result = parseSkillMd(readFixture('two-step-pipe.md'));
    expect(result.workflow.steps).toHaveLength(2);
    expect(result.workflow.steps[0]!.type).toBe('tool');
    expect(result.workflow.steps[1]!.type).toBe('transform');
  });

  it('parses llm-judgment workflow', () => {
    const result = parseSkillMd(readFixture('llm-judgment.md'));
    expect(result.workflow.steps).toHaveLength(2);
    const llmStep = result.workflow.steps[1]!;
    expect(llmStep.type).toBe('llm');
    if (llmStep.type === 'llm') {
      expect(llmStep.model).toBe('haiku');
      expect(llmStep.prompt).toContain('Score the priority');
    }
  });

  it('parses filter-exit workflow', () => {
    const result = parseSkillMd(readFixture('filter-exit.md'));
    expect(result.workflow.steps).toHaveLength(5);
    const filterStep = result.workflow.steps[1]!;
    expect(filterStep.type).toBe('transform');
    if (filterStep.type === 'transform' && filterStep.operation === 'filter') {
      expect(filterStep.where).toContain('$item.score');
    }
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
    const llmStep = result.workflow.steps[1]!;
    expect(llmStep.each).toBe('$steps.fetch.output.documents');
  });

  it('parses error-fail workflow', () => {
    const result = parseSkillMd(readFixture('error-fail.md'));
    expect(result.workflow.steps[0]!.on_error).toBe('fail');
  });

  it('parses error-ignore workflow', () => {
    const result = parseSkillMd(readFixture('error-ignore.md'));
    expect(result.workflow.steps[0]!.on_error).toBe('ignore');
  });

  it('parses retry-backoff workflow', () => {
    const result = parseSkillMd(readFixture('retry-backoff.md'));
    const step = result.workflow.steps[0]!;
    expect(step.retry).toEqual({ max: 3, delay: '100ms', backoff: 2.0 });
  });

  it('parses sort-pipeline workflow', () => {
    const result = parseSkillMd(readFixture('sort-pipeline.md'));
    expect(result.workflow.steps).toHaveLength(3);
    const sortStep = result.workflow.steps[1]!;
    expect(sortStep.type).toBe('transform');
    if (sortStep.type === 'transform' && sortStep.operation === 'sort') {
      expect(sortStep.field).toBe('score');
      expect(sortStep.direction).toBe('desc');
    }
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
    try {
      parseSkillMd(readFixture('malformed-bad-schema.md'));
      expect.fail('should have thrown');
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

// ─── parseWorkflowFromMd tests ───────────────────────────────────────────────

describe('parseWorkflowFromMd', () => {
  it('parses workflow from markdown without requiring frontmatter', () => {
    const content = readFixture('malformed-no-frontmatter.md');
    const result = parseWorkflowFromMd(content);
    expect(result.steps).toHaveLength(1);
  });
});
