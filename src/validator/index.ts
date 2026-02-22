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

    // Tool availability
    if (step.type === 'tool' && toolAdapter && !toolAdapter.has(step.tool)) {
      errors.push({
        path: `${path}.tool`,
        message: `Tool "${step.tool}" is not registered`,
      });
    }

    // Validate $steps references in input sources
    for (const [inputName, input] of Object.entries(step.inputs)) {
      if (input.source) {
        validateSourceReference(
          input.source,
          step.id,
          `${path}.inputs.${inputName}.source`,
          stepMap,
          stepOrder,
          branchStepIds,
          errors,
        );
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

  // Validate workflow output source references
  for (const [outputName, outputDef] of Object.entries(workflow.outputs)) {
    if (outputDef.source) {
      const refs = extractStepReferences(outputDef.source);
      for (const refId of refs) {
        if (!stepMap.has(refId)) {
          errors.push({
            path: `outputs.${outputName}.source`,
            message: `References undefined step "${refId}"`,
          });
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
 * Extract step IDs referenced via $steps.<id> from an expression string.
 */
function extractStepReferences(expr: string): string[] {
  const refs: string[] = [];
  const regex = /\$steps\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(expr)) !== null) {
    refs.push(match[1]!);
  }
  return refs;
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

    // Collect all $steps references from inputs, conditions, each, output
    for (const input of Object.values(step.inputs)) {
      if (input.source) {
        for (const ref of extractStepReferences(input.source)) {
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

    // Conditional steps depend on their branch targets
    if (step.type === 'conditional') {
      for (const id of step.then) stepDeps.add(id);
      if (step.else) {
        for (const id of step.else) stepDeps.add(id);
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
