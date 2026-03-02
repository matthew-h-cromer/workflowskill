// Workflow-authoring evaluation suite.
//
// This file evaluates generated workflow fixtures against the structural
// expectations defined in cases.ts. Missing fixtures are skipped with
// guidance on how to generate them.
//
// Usage:
//   cd runtime && npx vitest test/workflow-authoring/workflow-authoring.test.ts
//
// To generate a fixture:
//   1. Run: /workflow-author <prompt>  (using the Claude Code skill)
//   2. Save the output to: runtime/test/workflow-authoring/fixtures/<id>.md
//   3. Re-run the tests to see the scorecard.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_CASES } from './cases.js';
import { evaluate } from './harness.js';
import { buildScorecard, formatScorecard } from './scorecard.js';
import type { EvalResult } from './harness.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

// Collect results for the scorecard printed after all tests
const collectedResults: EvalResult[] = [];

describe('workflow-authoring evaluation', () => {
  for (const evalCase of EVAL_CASES) {
    const fixturePath = join(FIXTURES_DIR, `${evalCase.id}.md`);

    describe(`${evalCase.id}`, () => {
      // Evaluate once per case, share result across assertions
      let result: EvalResult | undefined;

      beforeAll(() => {
        if (!existsSync(fixturePath)) return;
        const content = readFileSync(fixturePath, 'utf-8');
        result = evaluate(content, evalCase);
        collectedResults.push(result);
      });

      it('fixture exists', () => {
        if (!existsSync(fixturePath)) {
          console.log(
            `\n  ⚠  Missing fixture: ${evalCase.id}.md\n` +
              `     Generate it with:\n` +
              `       /workflow-author ${evalCase.prompt}\n` +
              `     Then save the output to:\n` +
              `       runtime/test/workflow-authoring/fixtures/${evalCase.id}.md\n`,
          );
          expect(true).toBe(true); // advisory, not blocking
          return;
        }
        expect(existsSync(fixturePath)).toBe(true);
      });

      it('parses and validates', () => {
        if (!result) return;

        if (!result.valid) {
          const errSummary = result.parseErrors.join('\n    ');
          expect.fail(
            `Workflow "${evalCase.id}" failed to parse/validate:\n    ${errSummary}`,
          );
        }
      });

      it('passes all structural checks', () => {
        if (!result || !result.valid) return;

        const failures = result.checks.filter((c) => !c.passed);
        if (failures.length > 0) {
          const failLines = failures
            .map((f) => `  - ${f.name}${f.detail ? ` (${f.detail})` : ''} [SKILL.md: ${f.skillRef}]`)
            .join('\n');
          expect.fail(
            `${failures.length} check(s) failed for "${evalCase.id}":\n${failLines}`,
          );
        }

        expect(result.checks.every((c) => c.passed)).toBe(true);
      });
    });
  }
});

// ─── Scorecard ────────────────────────────────────────────────────────────────

afterAll(() => {
  if (collectedResults.length === 0) {
    console.log('\n  No fixtures found — generate them with /workflow-author and save to fixtures/<id>.md\n');
    return;
  }
  const scorecard = buildScorecard(collectedResults);
  console.log(formatScorecard(scorecard));
});
