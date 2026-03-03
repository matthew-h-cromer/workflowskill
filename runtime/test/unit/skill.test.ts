// Tests for src/skill/index.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHORING_SKILL } from '../../src/skill/index.js';

const RUNTIME_SKILL = join(import.meta.dirname, '../../skill/SKILL.md');

describe('AUTHORING_SKILL', () => {
  it('exports non-empty content', () => {
    expect(AUTHORING_SKILL.length).toBeGreaterThan(0);
    expect(AUTHORING_SKILL).toContain('workflow-author');
  });

  it('matches runtime/skill/SKILL.md byte-for-byte', () => {
    const runtimeCopy = readFileSync(RUNTIME_SKILL, 'utf-8');
    expect(AUTHORING_SKILL).toBe(runtimeCopy);
  });
});
