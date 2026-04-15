import { zodToJsonSchema } from "zod-to-json-schema";
import { WorkflowSchema } from "./workflow.js";

/**
 * Generate a JSON Schema representation of the Workflow schema.
 * Useful for YAML Language Server autocomplete and third-party tooling.
 */
export function generateWorkflowJsonSchema(): object {
  return zodToJsonSchema(WorkflowSchema, {
    name: "Workflow",
    $refStrategy: "none",
  });
}
