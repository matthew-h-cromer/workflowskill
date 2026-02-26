import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseContent } from '../../src/parser/parse-content.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

describe('parseContent', () => {
  it('parses a full SKILL.md with frontmatter', () => {
    const result = parseContent(readFixture('echo.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('echo');
    expect(result.workflow.steps).toHaveLength(1);
  });

  it('falls back to bare workflow block when frontmatter is absent', () => {
    const result = parseContent(readFixture('malformed-no-frontmatter.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBeUndefined();
    expect(result.workflow.steps).toHaveLength(1);
  });

  it('returns ok: false for empty content', () => {
    const result = parseContent('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/empty/i);
  });

  it('returns ok: false for whitespace-only content', () => {
    const result = parseContent('   \n  ');
    expect(result.ok).toBe(false);
  });

  it('returns ok: false for content with no workflow block', () => {
    const result = parseContent(readFixture('malformed-no-block.md'));
    expect(result.ok).toBe(false);
  });

  it('returns ok: false for malformed YAML', () => {
    const result = parseContent(readFixture('malformed-bad-yaml.md'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('returns ok: false for bad schema and includes details', () => {
    const result = parseContent(readFixture('malformed-bad-schema.md'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBeGreaterThan(0);
  });
});
