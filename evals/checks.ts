/**
 * YAML-structure assertion helpers for eval tests.
 *
 * All helpers take a parsed Workflow and assert structural properties.
 * They throw with descriptive messages that include the raw YAML so the
 * developer can immediately see what was generated.
 */

import type { Step } from "../src/schema/steps.js";
import type { Workflow } from "../src/schema/workflow.js";
import { WeldableMockToolkit } from "../src/toolkit/weldable/mock.js";
import { validate } from "../src/validate/index.js";

// ---------------------------------------------------------------------------
// Recursive step iteration
// ---------------------------------------------------------------------------

function* allSteps(steps: Step[]): Generator<Step> {
  for (const step of steps) {
    yield step;

    switch (step.type) {
      case "if":
        yield* allSteps(step.then);
        if (step.else) yield* allSteps(step.else);
        break;
      case "switch":
        for (const body of Object.values(step.cases)) yield* allSteps(body);
        if (step.default) yield* allSteps(step.default);
        break;
      case "foreach":
      case "while":
        yield* allSteps(step.body);
        break;
      case "parallel":
        for (const body of Object.values(step.branches)) yield* allSteps(body);
        break;
      case "try":
        yield* allSteps(step.body);
        if (step.catch) yield* allSteps(step.catch);
        if (step.finally) yield* allSteps(step.finally);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all steps of a given type (recursive search). */
export function stepsOfType<T extends Step["type"]>(
  workflow: Workflow,
  type: T,
): Extract<Step, { type: T }>[] {
  const result: Extract<Step, { type: T }>[] = [];
  for (const step of allSteps(workflow.steps)) {
    if (step.type === type) {
      result.push(step as Extract<Step, { type: T }>);
    }
  }
  return result;
}

/** Find a step by id (recursive). Returns undefined if not found. */
export function stepById(workflow: Workflow, id: string): Step | undefined {
  for (const step of allSteps(workflow.steps)) {
    if (step.id === id) return step;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Assert the workflow has at least one step of the given type.
 */
export function assertHasStepType(
  workflow: Workflow,
  type: Step["type"],
  rawContent: string,
): void {
  const found = stepsOfType(workflow, type);
  if (found.length === 0) {
    throw new Error(
      `Expected at least one "${type}" step but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow does NOT have any step of the given type.
 */
export function assertNoStepType(workflow: Workflow, type: Step["type"], rawContent: string): void {
  const found = stepsOfType(workflow, type);
  if (found.length > 0) {
    throw new Error(
      `Expected no "${type}" steps but found ${found.length}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has at least one action step that uses the given action id.
 */
export function assertHasAction(workflow: Workflow, uses: string, rawContent: string): void {
  const actions = stepsOfType(workflow, "action");
  const found = actions.some((a) => a.uses === uses || a.uses.startsWith(uses));
  if (!found) {
    const uses_list = actions.map((a) => a.uses).join(", ") || "(none)";
    throw new Error(
      `Expected an action using "${uses}" but found: ${uses_list}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert no action steps use the given action id.
 */
export function assertNoAction(workflow: Workflow, uses: string, rawContent: string): void {
  const actions = stepsOfType(workflow, "action");
  const found = actions.filter((a) => a.uses === uses || a.uses.startsWith(uses));
  if (found.length > 0) {
    throw new Error(
      `Expected no action using "${uses}" but found ${found.length} use(s).\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert at least one action step has a retry policy.
 */
export function assertHasRetry(workflow: Workflow, rawContent: string): void {
  const actions = stepsOfType(workflow, "action");
  const found = actions.some((a) => a.retry !== undefined);
  if (!found) {
    throw new Error(
      `Expected at least one action step with a retry policy but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert at least one foreach step has concurrency >= the given value.
 */
export function assertForeachConcurrency(
  workflow: Workflow,
  minConcurrency: number,
  rawContent: string,
): void {
  const foreachs = stepsOfType(workflow, "foreach");
  if (foreachs.length === 0) {
    throw new Error(
      `Expected at least one foreach step but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
  const found = foreachs.some((f) => f.concurrency >= minConcurrency);
  if (!found) {
    const concurrencies = foreachs.map((f) => f.concurrency).join(", ");
    throw new Error(
      `Expected at least one foreach step with concurrency >= ${minConcurrency}, got: ${concurrencies}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has a declared output with the given key.
 */
export function assertHasOutput(workflow: Workflow, key: string, rawContent: string): void {
  if (!workflow.outputs || !(key in workflow.outputs)) {
    const keys = workflow.outputs ? Object.keys(workflow.outputs).join(", ") : "(none)";
    throw new Error(
      `Expected output key "${key}" but found: ${keys}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has a declared input with the given name.
 */
export function assertHasInput(workflow: Workflow, name: string, rawContent: string): void {
  if (!workflow.inputs || !(name in workflow.inputs)) {
    const keys = workflow.inputs ? Object.keys(workflow.inputs).join(", ") : "(none)";
    throw new Error(
      `Expected input "${name}" but found: ${keys}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow parses successfully (not null, no parseError).
 * This is the baseline assertion for every eval.
 */
export function assertParsed(
  workflow: Workflow | null,
  parseError: string | null,
  rawContent: string | null,
): asserts workflow is Workflow {
  if (rawContent === null) {
    throw new Error("Model never called save_workflow — no workflow was generated.");
  }
  if (workflow === null) {
    throw new Error(
      `Workflow YAML failed to parse:\n${parseError}\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has a try step with a catch block.
 */
export function assertHasTryCatch(workflow: Workflow, rawContent: string): void {
  const trySteps = stepsOfType(workflow, "try");
  if (trySteps.length === 0) {
    throw new Error(
      `Expected at least one "try" step but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
  const hasCatch = trySteps.some((t) => t.catch && t.catch.length > 0);
  if (!hasCatch) {
    throw new Error(
      `Expected a "try" step with a non-empty catch block but none had one.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has a parallel step with at least the given number of branches.
 */
export function assertParallelBranches(
  workflow: Workflow,
  minBranches: number,
  rawContent: string,
): void {
  const parallels = stepsOfType(workflow, "parallel");
  if (parallels.length === 0) {
    throw new Error(
      `Expected at least one "parallel" step but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
  const found = parallels.some((p) => Object.keys(p.branches).length >= minBranches);
  if (!found) {
    const counts = parallels.map((p) => Object.keys(p.branches).length).join(", ");
    throw new Error(
      `Expected a parallel step with >= ${minBranches} branches, got: ${counts}.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow has a wait_for_signal step.
 */
export function assertHasWaitForSignal(workflow: Workflow, rawContent: string): void {
  assertHasStepType(workflow, "wait_for_signal", rawContent);
}

/**
 * Assert the workflow has a while step.
 */
export function assertHasWhile(workflow: Workflow, rawContent: string): void {
  assertHasStepType(workflow, "while", rawContent);
}

/**
 * Assert every step in the workflow has a non-empty description of 80 chars or fewer.
 * This mirrors the schema constraint but gives a targeted eval failure message.
 */
export function assertAllStepsHaveDescriptions(workflow: Workflow, rawContent: string): void {
  const violations: string[] = [];
  for (const step of allSteps(workflow.steps)) {
    const desc = (step as { description?: string }).description;
    if (!desc || desc.trim().length === 0) {
      violations.push(`Step type="${step.type}" id="${step.id}" is missing a description`);
    } else if (desc.length > 80) {
      violations.push(
        `Step type="${step.type}" id="${step.id}" has a description > 80 chars (${desc.length})`,
      );
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Step description violations:\n${violations.map((v) => `  - ${v}`).join("\n")}\n\nGenerated content:\n${rawContent}`,
    );
  }
}

/**
 * Assert a while step has max_iterations set.
 */
export function assertWhileHasMaxIterations(workflow: Workflow, rawContent: string): void {
  const whiles = stepsOfType(workflow, "while");
  if (whiles.length === 0) {
    throw new Error(
      `Expected at least one "while" step but found none.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
  // max_iterations is required by schema — if it parsed, it's present
  // Just assert no while step has a suspiciously low max_iterations
  const zeroIter = whiles.filter((w) => w.max_iterations < 1);
  if (zeroIter.length > 0) {
    throw new Error(
      `Found while step(s) with max_iterations < 1.\n\nGenerated YAML:\n${rawContent}`,
    );
  }
}

/**
 * Assert the workflow passes full static validation (schema, semantic,
 * action-catalog, JSONata syntax, step references) and optional dry-run.
 *
 * This is the baseline end-to-end assertion for every eval — a workflow that
 * parses but fails validation would not run on Weldable.
 */
export async function assertPassesValidate(
  rawContent: string,
  opts: { dryRun?: boolean } = {},
): Promise<void> {
  const evalToolkit = new WeldableMockToolkit();
  const result = await validate(rawContent, {
    toolkit: evalToolkit,
    dryRun: opts.dryRun ?? false,
  });

  if (!result.ok) {
    const issueLines = result.issues
      .map((i) => `  ${i.severity}  ${i.code}  ${i.path}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Workflow failed validation:\n${issueLines}\n\nGenerated content:\n${rawContent}`,
    );
  }
}
