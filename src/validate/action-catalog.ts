import type { Workflow } from "../schema/workflow.js";
import type { ActionSchema, Toolkit } from "../toolkit/protocol.js";
import type { Issue } from "./index.js";
import { extractSpans } from "./walk.js";
import { walkSteps } from "./walk.js";

/**
 * Validate every `action` step in a workflow against the toolkit's action catalog.
 *
 * Emits:
 *   - `unknown-action`  when step.uses is not registered in the toolkit
 *   - `action-args`     when required inputs are missing, unknown keys are present,
 *                       or literal (non-template) values have the wrong type
 *
 * Type checking is strict for string/text/number/boolean/enum types. For object/array
 * types only presence is checked (no deep schema). Any value containing a `{{ }}`
 * template span is treated as a runtime expression and skipped for type checking,
 * but still counts toward required-field presence.
 */
export async function checkActionCatalog(workflow: Workflow, toolkit: Toolkit): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Build a local cache so we don't call getAction() per step in large workflows
  const catalogCache = new Map<string, ActionSchema | null>();

  async function lookupAction(id: string): Promise<ActionSchema | null> {
    if (catalogCache.has(id)) return catalogCache.get(id) ?? null;
    const schema = await toolkit.getAction(id);
    catalogCache.set(id, schema ?? null);
    return schema ?? null;
  }

  const stepNodes: Array<{ step: import("../schema/steps.js").ActionStep; path: string }> = [];

  walkSteps(workflow.steps, "steps", ({ step, path }) => {
    if (step.type === "action") {
      stepNodes.push({ step, path });
    }
  });

  for (const { step, path } of stepNodes) {
    const schema = await lookupAction(step.uses);

    if (!schema) {
      issues.push({
        severity: "error",
        code: "unknown-action",
        path: `${path}.uses`,
        message: `Unknown action "${step.uses}". Run \`workflowskill actions list\` to find available actions.`,
      });
      // Can't check args if the action is unknown
      continue;
    }

    const with_ = step.with ?? {};
    const inputsByName = new Map(schema.inputFields.map((f) => [f.name, f]));

    // Check for missing required inputs
    for (const field of schema.inputFields) {
      if (!field.required) continue;
      if (field.default !== undefined) continue; // has a default — not actually required at call site
      if (!(field.name in with_)) {
        issues.push({
          severity: "error",
          code: "action-args",
          path: `${path}.with`,
          message: `Action "${step.uses}" requires input "${field.name}" (${field.type}) but it is missing from \`with:\``,
        });
      }
    }

    // Check provided keys
    for (const [key, rawValue] of Object.entries(with_)) {
      const field = inputsByName.get(key);

      if (!field) {
        issues.push({
          severity: "error",
          code: "action-args",
          path: `${path}.with.${key}`,
          message: `Action "${step.uses}" does not have an input named "${key}". Check \`workflowskill actions describe ${step.uses}\` for valid inputs.`,
        });
        continue;
      }

      // Type-check only literal values (not template expressions)
      const typeErr = checkLiteralType(rawValue, field, key, step.uses);
      if (typeErr) {
        issues.push({
          severity: "error",
          code: "action-args",
          path: `${path}.with.${key}`,
          message: typeErr,
        });
      }
    }
  }

  return issues;
}

/**
 * Check the type of a literal `with:` value against the declared InputField type.
 *
 * Returns an error message string if the value is invalid, or null if ok.
 * Skips type-checking when the value is a template expression or object/array type.
 */
function checkLiteralType(
  value: unknown,
  field: ActionSchema["inputFields"][number],
  key: string,
  actionId: string,
): string | null {
  // If the value is a string containing {{ }}, it's a runtime expression — skip
  if (typeof value === "string" && extractSpans(value).length > 0) {
    return null;
  }

  // object/array: presence only, no deep check
  if (field.type === "object" || field.type === "array") {
    return null;
  }

  switch (field.type) {
    case "string":
    case "text":
      if (typeof value !== "string") {
        return `Action "${actionId}" input "${key}" expects a string (got ${typeof value})`;
      }
      break;

    case "number":
      if (typeof value !== "number") {
        return `Action "${actionId}" input "${key}" expects a number (got ${typeof value})`;
      }
      break;

    case "boolean":
      if (typeof value !== "boolean") {
        return `Action "${actionId}" input "${key}" expects a boolean (got ${typeof value})`;
      }
      break;

    case "enum": {
      if (!field.options || field.options.length === 0) break;
      const validValues = field.options.map((o) => o.value);
      if (!validValues.includes(String(value))) {
        return `Action "${actionId}" input "${key}" must be one of: ${validValues.map((v) => `"${v}"`).join(", ")} (got ${JSON.stringify(value)})`;
      }
      break;
    }
  }

  return null;
}
