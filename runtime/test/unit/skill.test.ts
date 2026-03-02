// Tests for src/skill/index.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHORING_SKILL } from '../../src/skill/index.js';

const RUNTIME_SKILL = join(import.meta.dirname, '../../skill/SKILL.md');
const CANONICAL_SKILL = join(import.meta.dirname, '../../../.claude/skills/workflow-author/SKILL.md');

describe('AUTHORING_SKILL', () => {
  it('exports non-empty content', () => {
    expect(AUTHORING_SKILL.length).toBeGreaterThan(0);
    expect(AUTHORING_SKILL).toContain('workflow-author');
  });

  it('matches runtime/skill/SKILL.md byte-for-byte', () => {
    const runtimeCopy = readFileSync(RUNTIME_SKILL, 'utf-8');
    expect(AUTHORING_SKILL).toBe(runtimeCopy);
  });

  it('runtime/skill/SKILL.md is in sync with .claude/skills/workflow-author/SKILL.md', () => {
    const runtimeCopy = readFileSync(RUNTIME_SKILL, 'utf-8');
    const canonicalCopy = readFileSync(CANONICAL_SKILL, 'utf-8');
    if (runtimeCopy !== canonicalCopy) {
      throw new Error(
        'SKILL.md files are out of sync — copy runtime/skill/SKILL.md to .claude/skills/workflow-author/SKILL.md (or vice versa).',
      );
    }
  });
});
