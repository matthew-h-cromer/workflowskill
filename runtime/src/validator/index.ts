// Pre-execution workflow validator.
// Checks DAG resolution, type compatibility, tool availability, and structural correctness.
// Returns ALL errors, not just the first.

import type {
  WorkflowDefinition,
  Step,
  ValidationError,
  ValidationResult,
  ToolAdapter,
  ConditionalStep,
} from '../types/index.js';
import { parseContent } from '../parser/parse-content.js';

/**
 * Validate a workflow definition before execution.
 * Checks structural correctness, reference graph, type compatibility, and tool availability.
 * Returns all errors found — does not fail fast.
 */
export function validateWorkflow(
  workflow: WorkflowDefinition,
  toolAdapter?: ToolAdapter,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Build step lookup
  const stepMap = new Map<string, Step>();
  const stepOrder = new Map<string, number>();
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    stepOrder.set(step.id, i);

    if (stepMap.has(step.id)) {
      errors.push({
        path: `steps[${i}].id`,
        message: `Duplicate step ID "${step.id}"`,
      });
    }
    stepMap.set(step.id, step);
  }

  // Collect branch step IDs (steps referenced in conditional then/else)
  const branchStepIds = new Set<string>();
  for (const step of workflow.steps) {
    if (step.type === 'conditional') {
      for (const id of step.then) branchStepIds.add(id);
      if (step.else) {
        for (const id of step.else) branchStepIds.add(id);
      }
    }
  }

  // Per-step checks
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    const path = `steps[${i}]`;

    // Structural: `each` not valid on exit steps
    if (step.each && step.type === 'exit') {
      errors.push({
        path: `${path}.each`,
        message: `"each" is not valid on exit steps`,
      });
    }

    // Structural: `each` not valid on conditional steps
    if (step.each && step.type === 'conditional') {
      errors.push({
        path: `${path}.each`,
        message: `"each" is not valid on conditional steps`,
      });
    }

    // Structural: `delay` requires `each`
    if (step.delay && !step.each) {
      errors.push({
        path: `${path}.delay`,
        message: `"delay" requires "each" to be present`,
      });
    }

    // Tool availability
    if (step.type === 'tool' && toolAdapter && !toolAdapter.has(step.tool)) {
      errors.push({
        path: `${path}.tool`,
        message: `Tool "${step.tool}" is not registered`,
      });
    }

    // Validate $steps references in input values (expressions and templates)
    for (const [inputName, input] of Object.entries(step.inputs)) {
      if (typeof input.value === 'string' && hasStepReferences(input.value)) {
        validateSourceReference(
          input.value,
          step.id,
          `${path}.inputs.${inputName}.value`,
          stepMap,
          stepOrder,
          branchStepIds,
          errors,
        );
      }
    }

    // Validate step output value expressions: $result is correct, $steps is wrong here
    for (const [outputName, output] of Object.entries(step.outputs)) {
      if (typeof output.value === 'string' && hasStepReferences(output.value)) {
        errors.push({
          path: `${path}.outputs.${outputName}.value`,
          message: `Step output "value" must use "$result" to map from the raw executor result, not "$steps" references. Use "$steps" in workflow outputs or step input values.`,
        });
      }
    }

    // Validate guard condition references
    if (step.condition) {
      validateExpressionReferences(
        step.condition,
        step.id,
        `${path}.condition`,
        stepMap,
        stepOrder,
        branchStepIds,
        errors,
      );
    }

    // Validate each references
    if (step.each) {
      validateExpressionReferences(
        step.each,
        step.id,
        `${path}.each`,
        stepMap,
        stepOrder,
        branchStepIds,
        errors,
      );
    }

    // Conditional: validate branch step IDs exist
    if (step.type === 'conditional') {
      validateBranchReferences(step, i, stepMap, errors);
    }

    // Exit: validate output expression references
    if (step.type === 'exit' && step.output) {
      if (typeof step.output === 'string') {
        validateExpressionReferences(
          step.output,
          step.id,
          `${path}.output`,
          stepMap,
          stepOrder,
          branchStepIds,
          errors,
        );
      } else {
        // Object literal — validate expression values within it
        for (const [key, val] of Object.entries(step.output)) {
          if (typeof val === 'string' && val.startsWith('$')) {
            validateExpressionReferences(
              val,
              step.id,
              `${path}.output.${key}`,
              stepMap,
              stepOrder,
              branchStepIds,
              errors,
            );
          }
        }
      }
    }
  }

  // Validate workflow output value references (expressions and templates)
  for (const [outputName, outputDef] of Object.entries(workflow.outputs)) {
    if (typeof outputDef.value === 'string') {
      // $result is only valid in step output value, not workflow output value
      if (outputDef.value.startsWith('$result') || /\$\{result[.\[]/.test(outputDef.value)) {
        errors.push({
          path: `outputs.${outputName}.value`,
          message: `"$result" is not valid in workflow output "value" — use "$steps.<id>.output" instead. "$result" is only valid in step output "value".`,
        });
      }
      if (hasStepReferences(outputDef.value)) {
        const refs = extractStepReferences(outputDef.value);
        for (const refId of refs) {
          if (!stepMap.has(refId)) {
            errors.push({
              path: `outputs.${outputName}.value`,
              message: `References undefined step "${refId}"`,
            });
          }
        }
      }
    }
  }

  // Check for cycles in the step reference graph
  const cycleErrors = detectCycles(workflow.steps, stepMap);
  errors.push(...cycleErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract step IDs referenced from an expression or template string.
 * Handles both expression form ($steps.<id>) and template form (${steps.<id>...}).
 */
function extractStepReferences(expr: string): string[] {
  const refs: string[] = [];
  // Expression form: $steps.<id>
  const exprRegex = /\$steps\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  // Template form: ${steps.<id>...}
  const tmplRegex = /\$\{steps\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = exprRegex.exec(expr)) !== null) refs.push(match[1]!);
  while ((match = tmplRegex.exec(expr)) !== null) refs.push(match[1]!);
  // Deduplicate
  return [...new Set(refs)];
}

/** Returns true if the string contains $steps references in either expression or template form. */
function hasStepReferences(value: string): boolean {
  return value.startsWith('$steps.') || /\$\{steps\./.test(value);
}

/**
 * Validate that a source expression references valid, earlier-defined steps.
 */
function validateSourceReference(
  source: string,
  currentStepId: string,
  path: string,
  stepMap: Map<string, Step>,
  stepOrder: Map<string, number>,
  branchStepIds: Set<string>,
  errors: ValidationError[],
): void {
  const refs = extractStepReferences(source);
  const currentOrder = stepOrder.get(currentStepId) ?? -1;

  for (const refId of refs) {
    if (!stepMap.has(refId)) {
      errors.push({
        path,
        message: `References undefined step "${refId}"`,
      });
    } else {
      const refOrder = stepOrder.get(refId) ?? -1;
      // A step can only reference steps declared before it (or branch targets
      // which may be later in the array but only execute when selected).
      if (refOrder >= currentOrder && !branchStepIds.has(currentStepId)) {
        errors.push({
          path,
          message: `Step "${currentStepId}" references step "${refId}" which is not declared before it`,
        });
      }
    }
  }
}

/**
 * Validate expression references (condition, each, output).
 */
function validateExpressionReferences(
  expr: string,
  currentStepId: string,
  path: string,
  stepMap: Map<string, Step>,
  stepOrder: Map<string, number>,
  branchStepIds: Set<string>,
  errors: ValidationError[],
): void {
  const refs = extractStepReferences(expr);
  const currentOrder = stepOrder.get(currentStepId) ?? -1;

  for (const refId of refs) {
    if (!stepMap.has(refId)) {
      errors.push({
        path,
        message: `References undefined step "${refId}"`,
      });
    } else {
      const refOrder = stepOrder.get(refId) ?? -1;
      if (refOrder >= currentOrder && !branchStepIds.has(currentStepId)) {
        errors.push({
          path,
          message: `Step "${currentStepId}" references step "${refId}" which is not declared before it`,
        });
      }
    }
  }
}

/**
 * Validate conditional step branch references.
 */
function validateBranchReferences(
  step: ConditionalStep,
  stepIndex: number,
  stepMap: Map<string, Step>,
  errors: ValidationError[],
): void {
  const path = `steps[${stepIndex}]`;

  for (const id of step.then) {
    if (!stepMap.has(id)) {
      errors.push({
        path: `${path}.then`,
        message: `Branch references undefined step "${id}"`,
      });
    }
  }

  if (step.else) {
    for (const id of step.else) {
      if (!stepMap.has(id)) {
        errors.push({
          path: `${path}.else`,
          message: `Branch references undefined step "${id}"`,
        });
      }
    }
  }
}

/**
 * Detect cycles in the step reference graph.
 * Steps form a DAG through $steps references. Cycles would cause infinite loops.
 */
function detectCycles(
  steps: Step[],
  stepMap: Map<string, Step>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build adjacency list: step → set of steps it depends on
  const deps = new Map<string, Set<string>>();
  for (const step of steps) {
    const stepDeps = new Set<string>();

    // Collect data-flow dependencies from $steps references (expressions and templates).
    // Conditional branch targets are execution-order dependencies, NOT data-flow edges —
    // adding them here causes false cycle reports when branch steps reference the conditional.
    for (const input of Object.values(step.inputs)) {
      if (typeof input.value === 'string') {
        for (const ref of extractStepReferences(input.value)) {
          stepDeps.add(ref);
        }
      }
    }
    if (step.condition) {
      for (const ref of extractStepReferences(step.condition)) {
        stepDeps.add(ref);
      }
    }
    if (step.each) {
      for (const ref of extractStepReferences(step.each)) {
        stepDeps.add(ref);
      }
    }

    deps.set(step.id, stepDeps);
  }

  // Topological sort via DFS with cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string, pathStack: string[]): boolean {
    if (inStack.has(nodeId)) {
      const cycleStart = pathStack.indexOf(nodeId);
      const cycle = pathStack.slice(cycleStart).concat(nodeId);
      errors.push({
        path: `steps`,
        message: `Cycle detected: ${cycle.join(' → ')}`,
      });
      return true;
    }

    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);
    pathStack.push(nodeId);

    const nodeDeps = deps.get(nodeId) ?? new Set();
    for (const dep of nodeDeps) {
      if (stepMap.has(dep)) {
        dfs(dep, pathStack);
      }
    }

    pathStack.pop();
    inStack.delete(nodeId);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      dfs(step.id, []);
    }
  }

  return errors;
}

// ─── High-level API ──────────────────────────────────────────────────────────

export interface ValidateWorkflowSkillOptions {
  content: string;
  toolAdapter?: ToolAdapter;
}

export interface ValidateWorkflowSkillResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  name?: string;
  stepCount?: number;
  stepTypes?: string[];
}

/**
 * Parse content and validate the workflow in one synchronous call.
 * Matches the shape of the plugin's ValidateResult exactly.
 */
export function validateWorkflowSkill(options: ValidateWorkflowSkillOptions): ValidateWorkflowSkillResult {
  const { content, toolAdapter } = options;

  const parsed = parseContent(content);
  if (!parsed.ok) {
    return {
      valid: false,
      errors: parsed.details ?? [{ path: 'parse', message: parsed.message }],
    };
  }

  const result = validateWorkflow(parsed.workflow, toolAdapter);
  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  const stepTypes = [...new Set(parsed.workflow.steps.map((s) => s.type))];
  return {
    valid: true,
    errors: [],
    name: parsed.name,
    stepCount: parsed.workflow.steps.length,
    stepTypes,
  };
}
