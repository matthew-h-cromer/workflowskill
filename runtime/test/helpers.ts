import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, 'fixtures');

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}
