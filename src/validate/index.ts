import { runWorkflow } from "../interpreter/index.js";
import { parseWorkflowContent } from "../loader/parse.js";
import type { Toolkit } from "../toolkit/protocol.js";
import { checkActionCatalog } from "./action-catalog.js";
import { DryRunIterationCapError, DryRunRuntime } from "./dry-run-runtime.js";
import { checkJsonata, extractStepRefs } from "./expressions.js";
import { synthesizeInputs } from "./synthesize-inputs.js";
import { createStubToolkit } from "./stub-toolkit.js";
import { type ExpressionNode, extractSpans, visitStepExpressions, walkSteps } from "./walk.js";

export type IssueCode =
  | "schema"
  | "semantic"
  | "unknown-action"
  | "action-args"
  | "action-schema"
  | "jsonata-syntax"
  | "jsonata-unknown-fn"
  | "unknown-step-ref"
  | "dry-run"
  | "dry-run-advisory";

export interface Issue {
  severity: "error" | "warning";
  code: IssueCode;
  path: string;
  message: string;
}

export interface ValidateOptions {
  /**
   * Execute the workflow under DryRunRuntime with a stub toolkit.
   * Default: true. Pass false to skip (e.g. for fast unit tests or CI passes
   * that already cover dry-run separately).
   */
  dryRun?: boolean;
  /**
   * Inputs used for dry-run. These are merged *over* synthesized defaults
   * derived from the workflow's declared `inputs:` block. When dryRun is false
   * these are ignored.
   */
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
 *   1. parse + schema      → `schema`, `semantic` issues
 *   2. catalog check       → `unknown-action`, `action-args`, `action-schema` issues
 *   3. expression check    → `jsonata-syntax`, `jsonata-unknown-fn`, `jsonata-semantic`,
 *                             `unknown-step-ref` (stub-evaluates every expression)
 *   4. dry-run (default)   → `dry-run` (blocking), `dry-run-advisory` (non-blocking)
 *                             Inputs are synthesized from typed frontmatter when not provided.
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
      severity: "error" as const,
      code: (i.path.startsWith("steps") && /duplicate|shadows|Wait step/i.test(i.message)
        ? "semantic"
        : "schema") as IssueCode,
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

  // 2. Action-catalog checks (optional — only when a toolkit is provided).
  if (opts.toolkit) {
    const catalogIssues = await checkActionCatalog(workflow, opts.toolkit);
    if (catalogIssues.length > 0) return { ok: false, issues: catalogIssues };
  }

  // 3. Static expression checks (async — stub-evaluate each expression).
  const expressionNodes: Array<ExpressionNode> = [];
  walkSteps(workflow.steps, "steps", (node) => {
    visitStepExpressions(node, (expr) => expressionNodes.push(expr));
  });

  // Top-level output templates live outside the step tree.
  if (workflow.outputs) {
    const allStepIds = collectAllStepIds(workflow.steps);
    for (const [key, template] of Object.entries(workflow.outputs)) {
      for (const expr of extractSpans(template)) {
        expressionNodes.push({ expr, path: `outputs.${key}`, inScopeIds: allStepIds });
      }
    }
  }

  await Promise.all(expressionNodes.map((node) => checkExpression(node, issues)));

  if (issues.length > 0) return { ok: false, issues };

  // 4. Dry-run (default: true). Synthesize inputs from typed frontmatter, then
  //    merge any user-provided overrides on top.
  const dryRun = opts.dryRun ?? true;
  if (dryRun) {
    const synthesized = synthesizeInputs(workflow);
    const inputs = { ...synthesized, ...(opts.inputs ?? {}) };

    const runtime = new DryRunRuntime();
    const toolkit = opts.toolkit ?? createStubToolkit();

    let dryRunError: Error | null = null;
    try {
      await runWorkflow(workflow, inputs, runtime, toolkit);
    } catch (err) {
      dryRunError = err instanceof Error ? err : new Error(String(err));
    }

    if (dryRunError) {
      const isBenign =
        dryRunError instanceof DryRunIterationCapError ||
        // User-authored $error() surfaces as a JSONata D3137 error message
        (dryRunError.message.includes("D3137") ||
          dryRunError.message.includes("$error"));

      if (isBenign) {
        // Advisory: non-blocking, reported as warning
        return {
          ok: true,
          issues: [
            {
              severity: "warning",
              code: "dry-run-advisory",
              path: "",
              message: dryRunError.message,
            },
          ],
        };
      }

      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "dry-run",
            path: "",
            message: dryRunError.message,
          },
        ],
      };
    }
  }

  return { ok: true, issues: [] };
}

async function checkExpression(node: ExpressionNode, issues: Issue[]): Promise<void> {
  const err = await checkJsonata(node.expr);
  if (err) {
    issues.push({
      severity: "error",
      code: err.code,
      path: node.path,
      message: err.message,
    });
    // Don't attempt ref extraction on expressions with syntax errors
    if (err.code === "jsonata-syntax") return;
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
