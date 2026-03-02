// Scorecard: aggregates EvalResults into a summary and formats it for console output.
// The [SKILL.md: ...] annotations in the output make failures immediately actionable.

import type { EvalResult } from './harness.js';

// ─── Scorecard types ──────────────────────────────────────────────────────────

export interface FailureInfo {
  caseId: string;
  parseErrors: string[];
  failedChecks: Array<{ name: string; skillRef: string; detail?: string }>;
}

export interface Scorecard {
  totalCases: number;
  validCount: number;
  allChecksPassedCount: number;
  avgScore: number;
  failures: FailureInfo[];
}

// ─── buildScorecard() ─────────────────────────────────────────────────────────

export function buildScorecard(results: EvalResult[]): Scorecard {
  const totalCases = results.length;
  const validCount = results.filter((r) => r.valid).length;
  const allChecksPassedCount = results.filter((r) => r.valid && r.checks.every((c) => c.passed)).length;
  const avgScore =
    totalCases > 0 ? results.reduce((sum, r) => sum + r.score, 0) / totalCases : 0;

  // Collect failures
  const failures: FailureInfo[] = [];
  for (const result of results) {
    const failedChecks = result.checks.filter((c) => !c.passed);
    if (!result.valid || failedChecks.length > 0) {
      failures.push({
        caseId: result.caseId,
        parseErrors: result.parseErrors,
        failedChecks: failedChecks.map((c) => ({
          name: c.name,
          skillRef: c.skillRef,
          detail: c.detail,
        })),
      });
    }
  }

  return { totalCases, validCount, allChecksPassedCount, avgScore, failures };
}

// ─── formatScorecard() ────────────────────────────────────────────────────────

export function formatScorecard(scorecard: Scorecard): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=== Workflow Authoring Scorecard ===');
  lines.push(
    `Total: ${scorecard.totalCases} cases | ` +
      `Valid: ${scorecard.validCount}/${scorecard.totalCases} | ` +
      `All checks passed: ${scorecard.allChecksPassedCount}/${scorecard.totalCases} | ` +
      `Avg score: ${(scorecard.avgScore * 100).toFixed(1)}%`,
  );

  if (scorecard.failures.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const failure of scorecard.failures) {
      lines.push(`  ${failure.caseId}:`);
      if (failure.parseErrors.length > 0) {
        lines.push(`    ✗ Parse/validation failed:`);
        for (const err of failure.parseErrors) {
          lines.push(`      ${err}`);
        }
      }
      for (const check of failure.failedChecks) {
        const detail = check.detail ? ` — ${check.detail}` : '';
        lines.push(`    - ${check.name}${detail} [SKILL.md: ${check.skillRef}]`);
      }
    }
  } else {
    lines.push('');
    lines.push('All cases passed! ✓');
  }

  lines.push('');
  return lines.join('\n');
}
