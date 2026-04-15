import type { Workflow } from "../schema/workflow.js";
import { extractStepRefs } from "./expressions.js";
import { extractSpans, walkSteps } from "./walk.js";

/**
 * Synthesize a set of typed default inputs from a workflow's declared `inputs` block.
 *
 * Rules (in priority order):
 *   1. If a spec has a `default`, use it.
 *   2. Otherwise use a type-based default:
 *        string  → ""
 *        number  → 0
 *        boolean → false
 *        object  → {}
 *        array   → [null] if the input is referenced in a foreach.items expression
 *                  (so the foreach body is exercised once), else []
 *
 * The caller merges user-provided inputs *over* these defaults so that explicit
 * values always win.
 */
export function synthesizeInputs(workflow: Workflow): Record<string, unknown> {
  const inputs = workflow.inputs ?? {};
  if (Object.keys(inputs).length === 0) return {};

  // Find input names that are referenced inside foreach.items expressions
  // so we can promote [] → [null] for those.
  const foreachItemsInputs = collectForeachItemsInputRefs(workflow);

  const result: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(inputs)) {
    if (spec.default !== undefined) {
      result[name] = spec.default;
      continue;
    }

    switch (spec.type) {
      case "string":
        result[name] = "";
        break;
      case "number":
        result[name] = 0;
        break;
      case "boolean":
        result[name] = false;
        break;
      case "object":
        result[name] = {};
        break;
      case "array":
        // Provide a single-element array for inputs fed into foreach.items so
        // the loop body is exercised at least once during dry-run.
        result[name] = foreachItemsInputs.has(name) ? [null] : [];
        break;
    }
  }

  return result;
}

/**
 * Collect the names of workflow inputs that appear in foreach.items expressions.
 * We use this to decide whether to synthesize [] or [null] for array inputs.
 */
function collectForeachItemsInputRefs(workflow: Workflow): Set<string> {
  const refs = new Set<string>();

  walkSteps(workflow.steps, "steps", ({ step }) => {
    if (step.type !== "foreach") return;

    // foreach.items is a {{ }} template string
    for (const expr of extractSpans(step.items)) {
      // Look for input.<name> references
      for (const match of expr.matchAll(/\binput\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const name = match[1];
        if (name) refs.add(name);
      }
      // Also catch bare step refs (not input refs) — these don't need the array hint
      // but we scan extractStepRefs for completeness in case items refs a transform
      for (const _stepRef of extractStepRefs(expr)) {
        // step refs don't help us hint — skip
      }
    }
  });

  return refs;
}
