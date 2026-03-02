import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUTHORING_SKILL = readFileSync(
  join(import.meta.dirname, '../../skill/SKILL.md'),
  'utf-8',
);
