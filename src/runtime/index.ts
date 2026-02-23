// Runtime orchestrator.
// Validates the workflow, executes steps through the 8-step lifecycle, and produces a run log.

import type {
  WorkflowDefinition,
  WorkflowInput,
  Step,
  StepInput,
  StepOutput,
  RuntimeContext,
  ToolAdapter,
  LLMAdapter,
  RunLog,
  RunStatus,
  StepRecord,
  RetryRecord,
  TokenUsage,
  ExitStatus,
  ValidationError,
} from '../types/index.js';
import { resolveExpression } from '../expression/index.js';
import { validateWorkflow } from '../validator/index.js';
import { dispatch, StepExecutionError } from '../executor/index.js';
import type { DispatchResult } from '../executor/index.js';

/** Returns true if value is a $-expression string. */
function isExpression(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('$');
}

/** Resolve a value: if it's a $-expression, evaluate it; if it starts with $$, strip one $; otherwise return as-is. */
function resolveValue(value: unknown, context: RuntimeContext): unknown {
  if (typeof value === 'string' && value.startsWith('$$')) {
    return value.slice(1); // $$ escape → literal $
  }
  if (isExpression(value)) {
    return resolveExpression(value, context);
  }
  return value;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    public readonly validationErrors?: ValidationError[],
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}

export interface RunOptions {
  workflow: WorkflowDefinition;
  inputs?: Record<string, unknown>;
  toolAdapter: ToolAdapter;
  llmAdapter: LLMAdapter;
  workflowName?: string;
}

/**
 * Execute a workflow and produce a run log.
 * Phase 1: Validate the workflow definition.
 * Phase 2: Execute steps in declaration order following the 8-step lifecycle.
 */
export async function runWorkflow(options: RunOptions): Promise<RunLog> {
  const startedAt = new Date();

  // Phase 1: Validate
  const validation = validateWorkflow(options.workflow, options.toolAdapter);
  if (!validation.valid) {
    throw new WorkflowExecutionError(
      `Workflow validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      validation.errors,
    );
  }

  // Phase 2: Execute
  const inputs = applyDefaults(options.workflow.inputs, options.inputs ?? {});
  const context: RuntimeContext = { inputs, steps: {} };
  const stepRecords: StepRecord[] = [];

  // Identify branch steps (only execute when selected by conditional)
  const branchStepIds = collectBranchStepIds(options.workflow.steps);
  const stepMap = new Map(options.workflow.steps.map((s) => [s.id, s]));

  let workflowStatus: RunStatus = 'success';
  let workflowOutput: unknown = null;
  let exitFired = false;
  let halted = false;

  for (const step of options.workflow.steps) {
    if (halted) break;

    // Branch steps are skipped during normal sequential execution.
    // They execute only when selected by a conditional step.
    if (branchStepIds.has(step.id)) continue;

    const result = await executeStepLifecycle(
      step,
      context,
      stepMap,
      branchStepIds,
      options.toolAdapter,
      options.llmAdapter,
    );
    stepRecords.push(...result.records);

    if (result.exit) {
      halted = true;
      exitFired = true;
      workflowStatus = result.exit.status === 'failed' ? 'failed' : 'success';
      workflowOutput = result.exit.output;
    } else if (result.failed) {
      halted = true;
      workflowStatus = 'failed';
    } else {
      workflowOutput = context.steps[step.id]?.output ?? null;
    }
  }

  // Account for unrecorded steps (spec: "Every step is accounted for, including skipped ones.")
  const recordedIds = new Set(stepRecords.map((r) => r.id));
  for (const step of options.workflow.steps) {
    if (!recordedIds.has(step.id)) {
      stepRecords.push({
        id: step.id,
        executor: step.type,
        status: 'skipped',
        reason: branchStepIds.has(step.id) ? 'Branch not selected' : 'Workflow halted',
        duration_ms: 0,
      });
    }
  }

  // Build outputs
  const outputs = buildWorkflowOutputs(options.workflow, workflowOutput, context, exitFired);

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Build summary
  let stepsExecuted = 0;
  let stepsSkipped = 0;
  let totalTokens = 0;
  for (const rec of stepRecords) {
    if (rec.status === 'skipped') stepsSkipped++;
    else stepsExecuted++;
    if (rec.tokens) totalTokens += rec.tokens.input + rec.tokens.output;
  }

  return {
    id: crypto.randomUUID(),
    workflow: options.workflowName ?? 'unnamed',
    status: workflowStatus,
    summary: {
      steps_executed: stepsExecuted,
      steps_skipped: stepsSkipped,
      total_tokens: totalTokens,
      total_duration_ms: durationMs,
    },
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    inputs,
    steps: stepRecords,
    outputs,
  };
}

// ─── Step lifecycle ─────────────────────────────────────────────────────────

interface LifecycleResult {
  records: StepRecord[];
  exit?: { status: ExitStatus; output: unknown };
  failed?: boolean;
}

/**
 * Execute one step through the 8-step lifecycle:
 * 1. Guard  2. Resolve inputs  3. Iterate (each)  4. Dispatch
 * 5. Validate output  6. Handle errors  7. Retry  8. Record
 */
async function executeStepLifecycle(
  step: Step,
  context: RuntimeContext,
  stepMap: Map<string, Step>,
  branchStepIds: Set<string>,
  toolAdapter: ToolAdapter,
  llmAdapter: LLMAdapter,
): Promise<LifecycleResult> {
  const startTime = performance.now();
  const records: StepRecord[] = [];

  // 1. Guard — evaluate condition guard (not for conditional steps which use condition differently)
  if (step.condition && step.type !== 'conditional') {
    const guardResult = resolveExpression(step.condition, context);
    if (!guardResult) {
      context.steps[step.id] = { output: null };
      records.push({
        id: step.id,
        executor: step.type,
        status: 'skipped',
        reason: 'Guard condition evaluated to false',
        duration_ms: Math.round(performance.now() - startTime),
      });
      return { records };
    }
  }

  // 2. Resolve inputs
  const resolvedInputs = resolveInputs(step.inputs, context, step.id);

  // 3. Iterate (each) — if present, execute once per element
  if (step.each) {
    return executeWithEach(
      step,
      context,
      stepMap,
      branchStepIds,
      toolAdapter,
      llmAdapter,
      startTime,
    );
  }

  // 4-7. Dispatch with retry + error handling
  try {
    const { result, retries } = await dispatchWithRetry(
      step,
      resolvedInputs,
      context,
      toolAdapter,
      llmAdapter,
    );

    // Handle dispatch result by kind
    if (result.kind === 'exit') {
      context.steps[step.id] = { output: result.output };
      records.push({
        id: step.id,
        executor: 'exit',
        status: 'success',
        duration_ms: Math.round(performance.now() - startTime),
        inputs: resolvedInputs,
        output: result.output,
        retries,
      });
      return { records, exit: { status: result.status, output: result.output } };
    }

    if (result.kind === 'branch') {
      // Execute the selected branch steps
      const branchRecords = await executeBranch(
        result.stepIds,
        context,
        stepMap,
        branchStepIds,
        toolAdapter,
        llmAdapter,
      );

      // Conditional step output = last branch step output
      const lastBranchStepId = result.stepIds[result.stepIds.length - 1];
      const conditionalOutput = lastBranchStepId
        ? (context.steps[lastBranchStepId]?.output ?? null)
        : null;
      context.steps[step.id] = { output: conditionalOutput };

      // Record the conditional step itself
      records.push({
        id: step.id,
        executor: 'conditional',
        status: 'success',
        duration_ms: Math.round(performance.now() - startTime),
        inputs: resolvedInputs,
        output: conditionalOutput,
        retries,
      });
      // Then the branch step records
      records.push(...branchRecords.records);

      return {
        records,
        exit: branchRecords.exit,
        failed: branchRecords.failed,
      };
    }

    // Normal output — apply step output source mapping
    const mappedOutput = applyStepOutputMapping(step.outputs, result.output, context);
    context.steps[step.id] = { output: mappedOutput };
    records.push({
      id: step.id,
      executor: step.type,
      status: 'success',
      duration_ms: Math.round(performance.now() - startTime),
      inputs: resolvedInputs,
      output: mappedOutput,
      tokens: result.tokens,
      retries,
    });
    return { records };
  } catch (err) {
    // 6. Handle errors — apply on_error policy
    return handleStepError(step, err, context, startTime, resolvedInputs);
  }
}

// ─── Each iteration ────────────────────────────────────────────────────────

async function executeWithEach(
  step: Step,
  context: RuntimeContext,
  _stepMap: Map<string, Step>,
  _branchStepIds: Set<string>,
  toolAdapter: ToolAdapter,
  llmAdapter: LLMAdapter,
  startTime: number,
): Promise<LifecycleResult> {
  const records: StepRecord[] = [];

  const eachArray = resolveExpression(step.each!, context);
  if (!Array.isArray(eachArray)) {
    return handleStepError(
      step,
      new StepExecutionError(`each expression must resolve to an array, got ${typeof eachArray}`),
      context,
      startTime,
    );
  }

  // Resolve inputs with the base context (before iteration) for the record
  const baseResolvedInputs = resolveInputs(step.inputs, context, step.id);
  const results: unknown[] = [];
  let totalTokens: TokenUsage | undefined;
  let totalRetries: RetryRecord | undefined;

  try {
    for (let i = 0; i < eachArray.length; i++) {
      const itemContext: RuntimeContext = {
        ...context,
        item: eachArray[i],
        index: i,
      };
      const iterInputs = resolveInputs(step.inputs, itemContext, step.id);
      const { result, retries } = await dispatchWithRetry(
        step,
        iterInputs,
        itemContext,
        toolAdapter,
        llmAdapter,
      );

      if (retries) {
        totalRetries = totalRetries ?? { attempts: 0, errors: [] };
        totalRetries.attempts += retries.attempts;
        totalRetries.errors.push(...retries.errors);
      }

      if (result.kind === 'output') {
        // Apply per-element step output mapping
        const mappedIterOutput = applyStepOutputMapping(step.outputs, result.output, itemContext);
        results.push(mappedIterOutput);
        if (result.tokens) {
          totalTokens = totalTokens ?? { input: 0, output: 0 };
          totalTokens.input += result.tokens.input;
          totalTokens.output += result.tokens.output;
        }
      }
    }
  } catch (err) {
    return handleStepError(step, err, context, startTime, baseResolvedInputs, totalRetries);
  }

  context.steps[step.id] = { output: results };
  records.push({
    id: step.id,
    executor: step.type,
    status: 'success',
    duration_ms: Math.round(performance.now() - startTime),
    inputs: baseResolvedInputs,
    iterations: eachArray.length,
    tokens: totalTokens,
    output: results,
    retries: totalRetries,
  });

  return { records };
}

// ─── Branch execution ──────────────────────────────────────────────────────

async function executeBranch(
  stepIds: string[],
  context: RuntimeContext,
  stepMap: Map<string, Step>,
  branchStepIds: Set<string>,
  toolAdapter: ToolAdapter,
  llmAdapter: LLMAdapter,
): Promise<LifecycleResult> {
  const records: StepRecord[] = [];

  for (const stepId of stepIds) {
    const branchStep = stepMap.get(stepId);
    if (!branchStep) continue;

    const result = await executeStepLifecycle(
      branchStep,
      context,
      stepMap,
      branchStepIds,
      toolAdapter,
      llmAdapter,
    );
    records.push(...result.records);

    if (result.exit) {
      return { records, exit: result.exit };
    }
    if (result.failed) {
      return { records, failed: true };
    }
  }

  return { records };
}

// ─── Retry logic ──────────────────────────────────────────────────────────

/** Result from dispatchWithRetry: the dispatch result plus any retry tracking. */
interface RetryDispatchResult {
  result: DispatchResult;
  retries?: RetryRecord;
}

async function dispatchWithRetry(
  step: Step,
  resolvedInputs: Record<string, unknown>,
  context: RuntimeContext,
  toolAdapter: ToolAdapter,
  llmAdapter: LLMAdapter,
): Promise<RetryDispatchResult> {
  const retryPolicy = 'retry' in step ? step.retry : undefined;
  const maxRetries = retryPolicy?.max ?? 0;
  const baseDelay = retryPolicy ? parseDelay(retryPolicy.delay) : 0;
  const backoff = retryPolicy?.backoff ?? 1;

  let attempts = 0;
  const retryErrors: string[] = [];

  for (;;) {
    try {
      const result = await dispatch(step, resolvedInputs, context, toolAdapter, llmAdapter);
      const retries = attempts > 0 ? { attempts, errors: retryErrors } : undefined;
      return { result, retries };
    } catch (err) {
      const isRetriable =
        err instanceof StepExecutionError && err.retriable && attempts < maxRetries;
      if (!isRetriable) {
        // Attach accumulated retry info to the error for handleStepError
        if (attempts > 0 && err instanceof Error) {
          (err as ErrorWithRetries).__retries = { attempts, errors: retryErrors };
        }
        throw err;
      }

      retryErrors.push(err instanceof Error ? err.message : String(err));
      attempts++;
      const delay = baseDelay * Math.pow(backoff, attempts - 1);
      await sleep(delay);
    }
  }
}

// ─── Error handling ────────────────────────────────────────────────────────

/** Error augmented with retry info by dispatchWithRetry. */
interface ErrorWithRetries extends Error {
  __retries?: RetryRecord;
}

function handleStepError(
  step: Step,
  err: unknown,
  context: RuntimeContext,
  startTime: number,
  resolvedInputs?: Record<string, unknown>,
  retries?: RetryRecord,
): LifecycleResult {
  // Enrich error message with context (tool name, expression)
  let errorMessage = err instanceof Error ? err.message : String(err);
  if (err instanceof StepExecutionError && err.context?.tool) {
    errorMessage = `Tool "${err.context.tool}": ${errorMessage}`;
  }
  // Extract retry info attached by dispatchWithRetry if not passed explicitly
  const effectiveRetries = retries ?? (err instanceof Error ? (err as ErrorWithRetries).__retries : undefined);
  const onError = step.on_error ?? 'fail';
  const durationMs = Math.round(performance.now() - startTime);

  context.steps[step.id] = { output: null };

  const record: StepRecord = {
    id: step.id,
    executor: step.type,
    status: 'failed',
    duration_ms: durationMs,
    inputs: resolvedInputs,
    error: errorMessage,
    retries: effectiveRetries,
  };

  if (onError === 'ignore') {
    // Log the error, set output to null, continue
    return { records: [record] };
  }

  // on_error: fail — halt the workflow
  return { records: [record], failed: true };
}

// ─── Input resolution ──────────────────────────────────────────────────────

function resolveInputs(
  stepInputs: Record<string, StepInput>,
  context: RuntimeContext,
  stepId?: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(stepInputs)) {
    if (input.value !== undefined) {
      try {
        resolved[key] = resolveValue(input.value, context);
      } catch (err) {
        const expr = typeof input.value === 'string' ? input.value : JSON.stringify(input.value);
        const prefix = stepId ? `Step "${stepId}" input "${key}"` : `Input "${key}"`;
        throw new StepExecutionError(
          `${prefix}: failed to resolve expression ${expr}: ${err instanceof Error ? err.message : String(err)}`,
          false,
          { expression: typeof input.value === 'string' ? input.value : undefined },
        );
      }
    }
    // If no value, the key is omitted (not set to null)
  }
  return resolved;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function applyDefaults(
  schema: Record<string, WorkflowInput>,
  provided: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...provided };
  for (const [key, def] of Object.entries(schema)) {
    if (!(key in result) && def.value !== undefined) {
      result[key] = def.value;
    }
  }
  return result;
}

function collectBranchStepIds(steps: Step[]): Set<string> {
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.type === 'conditional') {
      for (const id of step.then) ids.add(id);
      if (step.else) {
        for (const id of step.else) ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * Apply step output value mapping.
 * For each declared output with a `value` expression, resolve against the raw executor result.
 * Outputs without `value` pass through from raw output by key name (backwards compatible).
 */
function applyStepOutputMapping(
  stepOutputs: Record<string, StepOutput>,
  rawOutput: unknown,
  context: RuntimeContext,
): unknown {
  const hasValues = Object.values(stepOutputs).some((o) => o.value !== undefined);
  if (!hasValues) return rawOutput;

  // Create a temporary context with $result set to the raw executor result
  const tempContext: RuntimeContext = { ...context, result: rawOutput };
  const mapped: Record<string, unknown> = {};

  for (const [key, outputDef] of Object.entries(stepOutputs)) {
    if (outputDef.value !== undefined) {
      mapped[key] = resolveValue(outputDef.value, tempContext);
    } else if (rawOutput !== null && typeof rawOutput === 'object' && !Array.isArray(rawOutput)) {
      // Pass through by key name from raw output
      mapped[key] = (rawOutput as Record<string, unknown>)[key] ?? null;
    } else {
      mapped[key] = null;
    }
  }

  return mapped;
}

function buildWorkflowOutputs(
  workflow: WorkflowDefinition,
  finalOutput: unknown,
  context: RuntimeContext,
  exitFired: boolean,
): Record<string, unknown> {
  const outputKeys = Object.keys(workflow.outputs);
  if (outputKeys.length === 0) return {};

  // If exit fired, use exit output (unchanged behavior)
  if (exitFired) {
    if (finalOutput !== null && typeof finalOutput === 'object' && !Array.isArray(finalOutput)) {
      const outputObj = finalOutput as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of outputKeys) {
        result[key] = outputObj[key] ?? null;
      }
      return result;
    }
    if (outputKeys.length === 1) {
      return { [outputKeys[0]!]: finalOutput };
    }
    return { [outputKeys[0]!]: finalOutput };
  }

  // Normal completion — resolve workflow output value expressions
  const hasAnyValues = Object.values(workflow.outputs).some((o) => o.value !== undefined);
  if (hasAnyValues) {
    const result: Record<string, unknown> = {};
    for (const [key, outputDef] of Object.entries(workflow.outputs)) {
      if (outputDef.value !== undefined) {
        result[key] = resolveValue(outputDef.value, context);
      } else if (finalOutput !== null && typeof finalOutput === 'object' && !Array.isArray(finalOutput)) {
        // Fall back to key-matching against last step output
        result[key] = (finalOutput as Record<string, unknown>)[key] ?? null;
      } else {
        result[key] = null;
      }
    }
    return result;
  }

  // No value fields — legacy behavior: match by key name against final output
  if (finalOutput !== null && typeof finalOutput === 'object' && !Array.isArray(finalOutput)) {
    const outputObj = finalOutput as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of outputKeys) {
      result[key] = outputObj[key] ?? null;
    }
    return result;
  }

  // Wrap primitive/array in first output key
  if (outputKeys.length === 1) {
    return { [outputKeys[0]!]: finalOutput };
  }

  return { [outputKeys[0]!]: finalOutput };
}

function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)(ms|s)$/);
  if (!match) return 0;
  const value = parseInt(match[1]!, 10);
  return match[2] === 's' ? value * 1000 : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
