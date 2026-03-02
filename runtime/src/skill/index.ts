import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readAuthoringSkill(): string {
  // For npm installs and dev (npm link): ../skill/SKILL.md relative to dist/
  // For tests running TypeScript source: ../../skill/SKILL.md relative to src/skill/
  const npmPath = join(import.meta.dirname, '../skill/SKILL.md');
  if (existsSync(npmPath)) {
    return readFileSync(npmPath, 'utf-8');
  }
  return readFileSync(join(import.meta.dirname, '../../skill/SKILL.md'), 'utf-8');
}

export const AUTHORING_SKILL = readAuthoringSkill();
