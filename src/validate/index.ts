import { runWorkflow } from "../interpreter/index.js";
import { parseWorkflowContent } from "../loader/parse.js";
import type { Toolkit } from "../toolkit/protocol.js";
import { checkActionCatalog } from "./action-catalog.js";
import { DryRunRuntime } from "./dry-run-runtime.js";
import { checkJsonata, extractStepRefs } from "./expressions.js";
import { createStubToolkit } from "./stub-toolkit.js";
import { type ExpressionNode, extractSpans, visitStepExpressions, walkSteps } from "./walk.js";

export type IssueCode =
  | "schema"
  | "semantic"
  | "unknown-action"
  | "action-args"
  | "jsonata-syntax"
  | "unknown-step-ref"
  | "dry-run";

export interface Issue {
  severity: "error" | "warning";
  code: IssueCode;
  path: string;
  message: string;
}

export interface ValidateOptions {
  /** Execute the workflow under InMemoryRuntime with a stub toolkit. Default: false. */
  dryRun?: boolean;
  /** Inputs used for dry-run. Ignored when dryRun is false. */
  inputs?: Record<string, unknown>;
  /**
   * Toolkit to use for action-catalog validation (unknown-action, action-args checks).
   * When omitted the catalog pass is skipped — useful for unit tests that don't depend
   * on any specific toolkit.
   */
  toolkit?: Toolkit;
}

export interface ValidateResult {
  ok: boolean;
  issues: Issue[];
}

/**
 * Validate a workflow end-to-end.
 *
 * Pipeline (short-circuits on the first failing phase):
 *   1. parse + schema  → `schema` issues
 *   2. semantic lint   → `semantic` issues
 *   3. expression scan → `jsonata-syntax`, `unknown-step-ref`
 *   4. dry-run (opt-in)→ `dry-run`
 */
export async function validate(
  content: string,
  opts: ValidateOptions = {},
): Promise<ValidateResult> {
  // 1. Parse + schema + existing semantic lint (id uniqueness, wait XOR).
  const parsed = parseWorkflowContent(content);
  if (!parsed.ok) {
    const issues: Issue[] = (
      parsed.error.issues ?? [{ path: "", message: parsed.error.message }]
    ).map((i) => ({
      severity: "error",
      code:
        i.path.startsWith("steps") && /duplicate|shadows|Wait step/i.test(i.message)
          ? "semantic"
          : "schema",
      path: i.path,
      message: i.message,
    }));
    if (issues.length === 0) {
      issues.push({ severity: "error", code: "schema", path: "", message: parsed.error.message });
    }
    return { ok: false, issues };
  }

  const { workflow } = parsed;
  const issues: Issue[] = [];

  // 2b. Action-catalog checks (optional — only when a toolkit is provided).
  if (opts.toolkit) {
    const catalogIssues = await checkActionCatalog(workflow, opts.toolkit);
    if (catalogIssues.length > 0) return { ok: false, issues: catalogIssues };
  }

  // 3. Static expression checks.
  walkSteps(workflow.steps, "steps", (node) => {
    visitStepExpressions(node, (expr) => checkExpression(expr, issues));
  });

  // Top-level output templates live outside the step tree.
  if (workflow.outputs) {
    const allStepIds = collectAllStepIds(workflow.steps);
    for (const [key, template] of Object.entries(workflow.outputs)) {
      for (const expr of extractSpans(template)) {
        checkExpression(
          {
            expr,
            path: `outputs.${key}`,
            inScopeIds: allStepIds,
          },
          issues,
        );
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // 4. Optional dry-run.
  if (opts.dryRun) {
    const runtime = new DryRunRuntime();
    try {
      await runWorkflow(workflow, opts.inputs ?? {}, runtime, createStubToolkit());
    } catch (err) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "dry-run",
            path: "",
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }
  }

  return { ok: true, issues: [] };
}

function checkExpression(node: ExpressionNode, issues: Issue[]): void {
  const err = checkJsonata(node.expr);
  if (err) {
    issues.push({
      severity: "error",
      code: "jsonata-syntax",
      path: node.path,
      message: err.message,
    });
    return; // don't attempt ref extraction on unparsable exprs
  }

  for (const refId of extractStepRefs(node.expr)) {
    if (!node.inScopeIds.has(refId)) {
      issues.push({
        severity: "error",
        code: "unknown-step-ref",
        path: node.path,
        message: `Reference to step "${refId}" which is not in scope at this location`,
      });
    }
  }
}

function collectAllStepIds(steps: import("../schema/steps.js").Step[]): Set<string> {
  const ids = new Set<string>();
  walkSteps(steps, "steps", ({ step }) => {
    ids.add(step.id);
  });
  return ids;
}
