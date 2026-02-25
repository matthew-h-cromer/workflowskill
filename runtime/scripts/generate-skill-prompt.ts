// Reads src/generator/workflow-author.md and writes src/generator/skill-prompt.ts
// Run before build: npx tsx scripts/generate-skill-prompt.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillContent = readFileSync(
  join(root, 'src/generator/workflow-author.md'),
  'utf-8',
);

const output = `// Auto-generated from src/generator/workflow-author.md — do not edit directly.
// Regenerate with: npx tsx scripts/generate-skill-prompt.ts

export const WORKFLOW_AUTHOR_PROMPT = ${JSON.stringify(skillContent)};
`;

writeFileSync(join(root, 'src/generator/skill-prompt.ts'), output);
console.log('Generated src/generator/skill-prompt.ts');
