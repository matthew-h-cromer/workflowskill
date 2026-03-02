// Evaluation harness: runs all structural checks for a given eval case.
// Returns a detailed result with per-check pass/fail + skillRef for diagnostics.

import { validateWorkflowSkill } from '../../src/validator/index.js';
import { parseContent } from '../../src/parser/parse-content.js';
import type { WorkflowDefinition, StepType } from '../../src/types/index.js';
import type { EvalCase, PatternContext } from './cases.js';

// ─── Check result ─────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  passed: boolean;
  /** Why the check failed (only populated when passed=false). */
  detail?: string;
  /** Where to fix it in SKILL.md. */
  skillRef: string;
}

// ─── Eval result ──────────────────────────────────────────────────────────────

export interface EvalResult {
  caseId: string;
  /** Whether the workflow parses and validates without errors. */
  valid: boolean;
  /** Parse/validation error messages (populated when valid=false). */
  parseErrors: string[];
  checks: CheckResult[];
  /** Fraction of checks that passed (0.0–1.0). */
  score: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pass(name: string, skillRef: string): CheckResult {
  return { name, passed: true, skillRef };
}

function fail(name: string, detail: string, skillRef: string): CheckResult {
  return { name, passed: false, detail, skillRef };
}

// ─── evaluate() ───────────────────────────────────────────────────────────────

/**
 * Evaluate a generated workflow against the expectations defined in `evalCase`.
 * Runs checks in order:
 *   1. Parse + validate
 *   2. Step count bounds
 *   3. Required/forbidden step types
 *   4. Required tools
 *   5. Required workflow inputs/outputs
 *   6. Custom PatternChecks (each maps to a SKILL.md rule)
 */
export function evaluate(content: string, evalCase: EvalCase): EvalResult {
  const checks: CheckResult[] = [];

  // 1. Parse and validate
  const validationResult = validateWorkflowSkill({ content });
  const parseResult = parseContent(content);

  let workflow: WorkflowDefinition | undefined;
  if (parseResult.ok) {
    workflow = parseResult.workflow;
  }

  if (!validationResult.valid) {
    const parseErrors = validationResult.errors.map((e) => `[${e.path}] ${e.message}`);
    // Still run pattern checks so the scorecard shows as many issues as possible
    const ctx: PatternContext = { content, workflow, validationResult };
    for (const pattern of evalCase.expectations.patterns) {
      try {
        const result = pattern.check(ctx);
        if (result === true) {
          checks.push(pass(pattern.name, pattern.skillRef));
        } else {
          const detail = typeof result === 'string' ? result : 'check returned false';
          checks.push(fail(pattern.name, detail, pattern.skillRef));
        }
      } catch (err) {
        checks.push(fail(pattern.name, `check threw: ${err instanceof Error ? err.message : String(err)}`, pattern.skillRef));
      }
    }
    return {
      caseId: evalCase.id,
      valid: false,
      parseErrors,
      checks,
      score: checks.length > 0 ? checks.filter((c) => c.passed).length / checks.length : 0,
    };
  }

  // 2. Step count bounds
  const stepCount = validationResult.stepCount ?? 0;
  const { minSteps, maxSteps } = evalCase.expectations;

  if (stepCount < minSteps) {
    checks.push(
      fail(
        `minimum step count (${minSteps})`,
        `workflow has ${stepCount} step(s), expected ≥ ${minSteps}`,
        '"YAML Structure Reference" / steps',
      ),
    );
  } else {
    checks.push(pass(`minimum step count (${minSteps})`, '"YAML Structure Reference" / steps'));
  }

  if (maxSteps !== undefined) {
    if (stepCount > maxSteps) {
      checks.push(
        fail(
          `maximum step count (${maxSteps})`,
          `workflow has ${stepCount} step(s), expected ≤ ${maxSteps}`,
          '"YAML Structure Reference" / steps',
        ),
      );
    } else {
      checks.push(pass(`maximum step count (${maxSteps})`, '"YAML Structure Reference" / steps'));
    }
  }

  // 3. Required step types
  const actualTypes = new Set<StepType>(validationResult.stepTypes as StepType[]);
  for (const required of evalCase.expectations.requiredStepTypes) {
    if (actualTypes.has(required)) {
      checks.push(pass(`has required step type: ${required}`, '"Step Types" section'));
    } else {
      checks.push(
        fail(
          `has required step type: ${required}`,
          `step type "${required}" not found in workflow (found: ${[...actualTypes].join(', ')})`,
          '"Step Types" section',
        ),
      );
    }
  }

  // 4. Forbidden step types
  for (const forbidden of evalCase.expectations.forbiddenStepTypes ?? []) {
    if (!actualTypes.has(forbidden)) {
      checks.push(pass(`no forbidden step type: ${forbidden}`, '"Step Types" section'));
    } else {
      checks.push(
        fail(
          `no forbidden step type: ${forbidden}`,
          `step type "${forbidden}" should not appear in this workflow`,
          '"Step Types" section',
        ),
      );
    }
  }

  // 5. Required tools (inspect ToolStep.tool fields)
  if ((evalCase.expectations.requiredTools ?? []).length > 0 && workflow) {
    const usedTools = new Set(
      workflow.steps.filter((s) => s.type === 'tool').map((s) => (s as { tool: string }).tool),
    );
    for (const requiredTool of evalCase.expectations.requiredTools!) {
      if (usedTools.has(requiredTool)) {
        checks.push(pass(`uses tool: ${requiredTool}`, '"Tool Step" section'));
      } else {
        checks.push(
          fail(
            `uses tool: ${requiredTool}`,
            `tool "${requiredTool}" not used (found: ${[...usedTools].join(', ') || 'none'})`,
            '"Tool Step" section',
          ),
        );
      }
    }
  }

  // 6. Required workflow inputs
  if ((evalCase.expectations.requiredInputs ?? []).length > 0 && workflow) {
    const actualInputs = new Set(Object.keys(workflow.inputs));
    for (const requiredInput of evalCase.expectations.requiredInputs!) {
      if (actualInputs.has(requiredInput)) {
        checks.push(pass(`has workflow input: ${requiredInput}`, '"Workflow Inputs" section'));
      } else {
        checks.push(
          fail(
            `has workflow input: ${requiredInput}`,
            `input "${requiredInput}" not declared (found: ${[...actualInputs].join(', ') || 'none'})`,
            '"Workflow Inputs" section',
          ),
        );
      }
    }
  }

  // 7. Required workflow outputs
  if ((evalCase.expectations.requiredOutputs ?? []).length > 0 && workflow) {
    const actualOutputs = new Set(Object.keys(workflow.outputs));
    for (const requiredOutput of evalCase.expectations.requiredOutputs!) {
      if (actualOutputs.has(requiredOutput)) {
        checks.push(pass(`has workflow output: ${requiredOutput}`, '"Workflow Outputs" section'));
      } else {
        checks.push(
          fail(
            `has workflow output: ${requiredOutput}`,
            `output "${requiredOutput}" not declared (found: ${[...actualOutputs].join(', ') || 'none'})`,
            '"Workflow Outputs" section',
          ),
        );
      }
    }
  }

  // 8. Custom pattern checks
  const ctx: PatternContext = { content, workflow, validationResult };
  for (const pattern of evalCase.expectations.patterns) {
    try {
      const result = pattern.check(ctx);
      if (result === true) {
        checks.push(pass(pattern.name, pattern.skillRef));
      } else {
        const detail = typeof result === 'string' ? result : 'check returned false';
        checks.push(fail(pattern.name, detail, pattern.skillRef));
      }
    } catch (err) {
      checks.push(
        fail(pattern.name, `check threw: ${err instanceof Error ? err.message : String(err)}`, pattern.skillRef),
      );
    }
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? passedCount / checks.length : 1;

  return {
    caseId: evalCase.id,
    valid: true,
    parseErrors: [],
    checks,
    score,
  };
}
