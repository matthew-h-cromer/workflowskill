// Evaluation case definitions for the workflow-author skill.
// Each case defines a prompt, expected structural properties, and pattern checks
// mapped to specific SKILL.md rules so failures are immediately actionable.

import type { WorkflowDefinition, StepType, ToolStep, LLMStep, TransformFilterStep, TransformMapStep, TransformSortStep, ExitStep, ConditionalStep } from '../../src/types/index.js';
import type { ValidateWorkflowSkillResult } from '../../src/validator/index.js';

// ─── Pattern context ───────────────────────────────────────────────────────────

export interface PatternContext {
  /** Raw .md file content. */
  content: string;
  /** Parsed workflow (only present if parsing succeeded). */
  workflow?: WorkflowDefinition;
  /** Result of validateWorkflowSkill. */
  validationResult: ValidateWorkflowSkillResult;
}

// ─── Pattern check ────────────────────────────────────────────────────────────

export interface PatternCheck {
  /** Human-readable description shown in failure output. */
  name: string;
  /** Which SKILL.md section/rule this validates — used for actionable diagnostics. */
  skillRef: string;
  /** Returns true if the check passes. May return a string describing why it failed. */
  check: (ctx: PatternContext) => boolean | string;
}

// ─── Structural expectations ──────────────────────────────────────────────────

export interface StructuralExpectation {
  minSteps: number;
  maxSteps?: number;
  requiredStepTypes: StepType[];
  forbiddenStepTypes?: StepType[];
  requiredTools?: string[];
  requiredInputs?: string[];
  requiredOutputs?: string[];
  /** Custom checks, each mapped to a SKILL.md rule. */
  patterns: PatternCheck[];
}

// ─── Eval case ────────────────────────────────────────────────────────────────

export interface EvalCase {
  /** kebab-case; matches fixture filename `fixtures/<id>.md`. */
  id: string;
  /** Natural language prompt for /workflow-author. */
  prompt: string;
  expectations: StructuralExpectation;
}

// ─── Reusable pattern checks ──────────────────────────────────────────────────

/**
 * LLM step outputs must map via `value: $result` (or reference $result in value).
 * SKILL.md Rule 5 / "LLM Step" section.
 */
export const llmOutputsHaveResultValue: PatternCheck = {
  name: 'LLM step outputs use $result value mapping',
  skillRef: 'Rule 5 / "LLM Step" section',
  check: ({ workflow }) => {
    if (!workflow) return 'no parsed workflow';
    const llmSteps = workflow.steps.filter((s): s is LLMStep => s.type === 'llm');
    if (llmSteps.length === 0) return true;
    for (const step of llmSteps) {
      for (const [key, output] of Object.entries(step.outputs)) {
        const val = String(output.value ?? '');
        if (!val.includes('$result')) {
          return `step "${step.id}" output "${key}" has value "${val}" — should reference $result`;
        }
      }
    }
    return true;
  },
};

/**
 * Workflow outputs must have a `value` field with a $steps reference.
 * SKILL.md Rule 4 / "Workflow Output Resolution" section.
 */
export const workflowOutputsHaveValue: PatternCheck = {
  name: 'Workflow outputs use value with $steps references',
  skillRef: 'Rule 4 / "Output Resolution" section',
  check: ({ workflow }) => {
    if (!workflow) return 'no parsed workflow';
    const outputs = Object.entries(workflow.outputs);
    if (outputs.length === 0) return true;
    for (const [key, output] of outputs) {
      const val = String(output.value ?? '');
      if (!val.includes('$steps')) {
        return `workflow output "${key}" has value "${val || '(none)'}" — should reference $steps`;
      }
    }
    return true;
  },
};

/**
 * Transform steps must have an `items` input referencing the array to process.
 * SKILL.md Rule 14 / "Transform Step" section.
 */
export const transformsHaveItemsInput: PatternCheck = {
  name: 'Transform steps have an items input',
  skillRef: 'Rule 14 / "Transform Step" section',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const transformSteps = workflow.steps.filter((s) => s.type === 'transform');
    if (transformSteps.length === 0) return true;
    return transformSteps.every((step) => 'items' in step.inputs);
  },
};

/**
 * http.request steps should include a retry policy.
 * SKILL.md Rule 8 / "Authoring Rules".
 */
export const httpToolsHaveRetry: PatternCheck = {
  name: 'http.request steps have retry policies',
  skillRef: 'Rule 8 / "Authoring Rules"',
  check: ({ workflow }) => {
    if (!workflow) return 'no parsed workflow';
    const httpSteps = workflow.steps.filter(
      (s): s is ToolStep => s.type === 'tool' && s.tool === 'http.request',
    );
    if (httpSteps.length === 0) return true;
    const missing = httpSteps.filter((s) => s.retry === undefined).map((s) => s.id);
    if (missing.length > 0) {
      return `http.request step(s) missing retry: ${missing.join(', ')}`;
    }
    return true;
  },
};

/**
 * No `source:` field usage — should use `value:` instead.
 * SKILL.md "YAML Structure Reference".
 */
export const noLegacySourceField: PatternCheck = {
  name: 'No legacy source: field (use value: instead)',
  skillRef: '"YAML Structure Reference" / Backwards Compatibility',
  check: ({ content }) => {
    // Only match `source:` inside the ```workflow block, not in markdown prose
    const workflowMatch = content.match(/```workflow\s*\n([\s\S]*?)```/);
    if (!workflowMatch) return true;
    const yamlBlock = workflowMatch[1]!;
    const match = yamlBlock.match(/^\s+source:/m);
    if (match) {
      return 'found "source:" in workflow YAML — use "value:" instead';
    }
    return true;
  },
};

/**
 * Retry policy uses `max` and `delay`, not `max_attempts` / `backoff_ms`.
 * SKILL.md "YAML Structure Reference".
 */
export const retryUsesCorrectFields: PatternCheck = {
  name: 'Retry uses max/delay fields (not max_attempts/backoff_ms)',
  skillRef: '"YAML Structure Reference" / RetryPolicy',
  check: ({ content }) => {
    return !/max_attempts:|backoff_ms:/.test(content);
  },
};

/**
 * LLM prompts that expect JSON output include "raw JSON" or "only JSON" instruction.
 * SKILL.md Rule 16 / "Authoring Rules".
 */
export const jsonPromptsHaveRawInstruction: PatternCheck = {
  name: 'LLM prompts requesting JSON say "raw JSON" or "only JSON"',
  skillRef: 'Rule 16 / "Authoring Rules"',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const llmSteps = workflow.steps.filter((s): s is LLMStep => s.type === 'llm');
    const jsonExpecting = llmSteps.filter(
      (s) => s.response_format !== undefined || /json/i.test(s.prompt),
    );
    if (jsonExpecting.length === 0) return true;
    return jsonExpecting.every((s) => /raw\s+json|only\s+json/i.test(s.prompt));
  },
};

/**
 * `each` must not be used on exit or conditional steps.
 * SKILL.md Rule 11 / "Authoring Rules".
 */
export const eachNotOnExitOrConditional: PatternCheck = {
  name: 'each not used on exit or conditional steps',
  skillRef: 'Rule 11 / "Authoring Rules"',
  check: ({ workflow }) => {
    if (!workflow) return false;
    return workflow.steps
      .filter((s) => s.type === 'exit' || s.type === 'conditional')
      .every((s) => s.each === undefined);
  },
};

/**
 * Exit steps that are NOT inside a conditional branch should have a `condition` guard.
 * SKILL.md Rule 9 / "Authoring Rules".
 */
export const exitStepsHaveConditionGuard: PatternCheck = {
  name: 'Exit steps (not in branches) have a condition guard',
  skillRef: 'Rule 9 / "Authoring Rules"',
  check: ({ workflow }) => {
    if (!workflow) return false;
    // Collect step IDs referenced in conditional then/else branches
    const branchStepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (step.type === 'conditional') {
        const cond = step as ConditionalStep;
        for (const id of cond.then) branchStepIds.add(id);
        for (const id of cond.else ?? []) branchStepIds.add(id);
      }
    }
    const exitSteps = workflow.steps.filter((s): s is ExitStep => s.type === 'exit');
    if (exitSteps.length === 0) return true;
    // If the only exit steps are inside branches, the check is N/A — pass
    const freeExits = exitSteps.filter((s) => !branchStepIds.has(s.id));
    if (freeExits.length === 0) return true;
    // Free exit steps must have a condition guard (unless it is the terminal step)
    // Heuristic: if there is only one exit step and it's the last step, it's terminal
    if (freeExits.length === 1 && workflow.steps[workflow.steps.length - 1]?.id === freeExits[0]?.id) {
      return true;
    }
    return freeExits.every((s) => s.condition !== undefined);
  },
};

/**
 * Each loops using `${...}` template interpolation for dynamic URLs.
 * SKILL.md "each Iteration Pattern" / Template Interpolation.
 */
export const usesTemplateInterpolation: PatternCheck = {
  name: 'uses template interpolation ${...} for dynamic values in each loops',
  skillRef: '"Iteration Patterns" / Template Interpolation',
  check: ({ workflow }) => {
    if (!workflow) return false;
    // Verify at least one step has BOTH `each` AND a template `${...}` in its inputs
    return workflow.steps.some((step) => {
      if (!step.each) return false;
      return Object.values(step.inputs).some((inp) => {
        const val = typeof inp.value === 'string' ? inp.value : '';
        return /\$\{[^}]+\}/.test(val);
      });
    });
  },
};

/**
 * Sort steps specify a direction.
 * SKILL.md "Transform Step" section.
 */
export const sortStepsHaveDirection: PatternCheck = {
  name: 'Sort transform steps specify direction',
  skillRef: '"Transform Step" section / sort operation',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const sortSteps = workflow.steps.filter(
      (s): s is TransformSortStep => s.type === 'transform' && (s as TransformSortStep).operation === 'sort',
    );
    if (sortSteps.length === 0) return true;
    return sortSteps.every((s) => s.direction !== undefined);
  },
};

/**
 * Filter steps have a `where` expression.
 * SKILL.md "Transform Step" section.
 */
export const filterStepsHaveWhere: PatternCheck = {
  name: 'Filter transform steps have a where expression',
  skillRef: '"Transform Step" section / filter operation',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const filterSteps = workflow.steps.filter(
      (s): s is TransformFilterStep => s.type === 'transform' && (s as TransformFilterStep).operation === 'filter',
    );
    if (filterSteps.length === 0) return true;
    return filterSteps.every((s) => s.where !== undefined && s.where.trim() !== '');
  },
};

/**
 * Map steps have an `expression` object.
 * SKILL.md "Transform Step" section.
 */
export const mapStepsHaveExpression: PatternCheck = {
  name: 'Map transform steps have an expression object',
  skillRef: '"Transform Step" section / map operation',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const mapSteps = workflow.steps.filter(
      (s): s is TransformMapStep => s.type === 'transform' && (s as TransformMapStep).operation === 'map',
    );
    if (mapSteps.length === 0) return true;
    return mapSteps.every(
      (s) => typeof s.expression === 'object' && s.expression !== null && !Array.isArray(s.expression),
    );
  },
};

/**
 * each + http.request steps must have retry with backoff to handle rate limits.
 * SKILL.md Rule 18 / "Iterating with each on Tool Steps".
 */
export const eachHttpHasBackoff: PatternCheck = {
  name: 'each + http.request steps have retry with backoff',
  skillRef: 'Rule 18 / "Iteration Patterns"',
  check: ({ workflow }) => {
    if (!workflow) return 'no parsed workflow';
    const eachHttpSteps = workflow.steps.filter(
      (s): s is ToolStep => s.type === 'tool' && s.tool === 'http.request' && s.each !== undefined,
    );
    if (eachHttpSteps.length === 0) return true;
    const missing = eachHttpSteps.filter((s) => !s.retry?.backoff).map((s) => s.id);
    if (missing.length > 0) {
      return `each + http.request step(s) missing retry with backoff: ${missing.join(', ')}`;
    }
    return true;
  },
};

/**
 * Step wiring: $steps references point to actual step IDs in the workflow.
 * SKILL.md "Expression Language" section.
 */
export const stepsReferencesAreValid: PatternCheck = {
  name: 'Step $steps references point to valid step IDs',
  skillRef: '"Expression Language" / $steps references',
  check: ({ workflow }) => {
    if (!workflow) return false;
    const stepIds = new Set(workflow.steps.map((s) => s.id));
    // Extract all $steps.<id> references from content
    const allValues: string[] = [];
    for (const step of workflow.steps) {
      for (const inp of Object.values(step.inputs)) {
        if (typeof inp.value === 'string') allValues.push(inp.value);
      }
      for (const out of Object.values(step.outputs)) {
        if (typeof out.value === 'string') allValues.push(out.value);
      }
    }
    for (const out of Object.values(workflow.outputs)) {
      if (typeof out.value === 'string') allValues.push(out.value);
    }
    for (const val of allValues) {
      const matches = val.matchAll(/\$steps\.(\w[\w-]*)/g);
      for (const m of matches) {
        if (!stepIds.has(m[1]!)) return false;
      }
    }
    return true;
  },
};

// ─── Eval cases ───────────────────────────────────────────────────────────────

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'hello-world',
    prompt: 'Return hello world',
    expectations: {
      minSteps: 1,
      maxSteps: 2,
      requiredStepTypes: ['exit'],
      forbiddenStepTypes: ['llm'],
      patterns: [noLegacySourceField, retryUsesCorrectFields, eachNotOnExitOrConditional],
    },
  },
  {
    id: 'greeting-with-input',
    prompt: 'Accept a name input, return a greeting like "Hello, <name>!"',
    expectations: {
      minSteps: 1,
      maxSteps: 2,
      requiredStepTypes: ['exit'],
      requiredInputs: ['name'],
      patterns: [noLegacySourceField, retryUsesCorrectFields],
    },
  },
  {
    id: 'fetch-url',
    prompt: 'Fetch a URL and return the response body',
    expectations: {
      minSteps: 1,
      maxSteps: 3,
      requiredStepTypes: ['tool'],
      requiredTools: ['http.request'],
      patterns: [noLegacySourceField, retryUsesCorrectFields, httpToolsHaveRetry, stepsReferencesAreValid],
    },
  },
  {
    id: 'llm-summarize',
    prompt: 'Accept a text input, summarize it with an LLM, return the summary',
    expectations: {
      minSteps: 1,
      maxSteps: 3,
      requiredStepTypes: ['llm'],
      requiredInputs: ['text'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        llmOutputsHaveResultValue,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
  {
    id: 'filter-numbers',
    prompt: 'Accept a list of numbers, filter to keep only even ones, return the filtered list',
    expectations: {
      minSteps: 1,
      maxSteps: 2,
      requiredStepTypes: ['transform'],
      patterns: [
        noLegacySourceField,
        transformsHaveItemsInput,
        filterStepsHaveWhere,
        workflowOutputsHaveValue,
      ],
    },
  },
  {
    id: 'sort-objects',
    prompt: 'Accept a list of objects with a score field, sort them by score descending, return sorted list',
    expectations: {
      minSteps: 1,
      maxSteps: 2,
      requiredStepTypes: ['transform'],
      patterns: [
        noLegacySourceField,
        transformsHaveItemsInput,
        sortStepsHaveDirection,
        workflowOutputsHaveValue,
      ],
    },
  },
  {
    id: 'map-objects',
    prompt: 'Accept a list of user objects, map each to extract only name and email fields, return the mapped list',
    expectations: {
      minSteps: 1,
      maxSteps: 2,
      requiredStepTypes: ['transform'],
      patterns: [
        noLegacySourceField,
        transformsHaveItemsInput,
        mapStepsHaveExpression,
        workflowOutputsHaveValue,
      ],
    },
  },
  {
    id: 'fetch-and-filter',
    prompt: 'Fetch a JSON API that returns a list of items, filter to keep only items where status is "active", return the filtered list',
    expectations: {
      minSteps: 2,
      maxSteps: 4,
      requiredStepTypes: ['tool', 'transform'],
      requiredTools: ['http.request'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        httpToolsHaveRetry,
        transformsHaveItemsInput,
        filterStepsHaveWhere,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
  {
    id: 'fetch-exit-early',
    prompt: 'Fetch data from an API, exit early with an error status if the response is empty, otherwise return the data',
    expectations: {
      minSteps: 2,
      maxSteps: 4,
      requiredStepTypes: ['tool', 'exit'],
      requiredTools: ['http.request'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        httpToolsHaveRetry,
        exitStepsHaveConditionGuard,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
  {
    id: 'fetch-each-details',
    prompt: 'Accept a list of IDs, fetch details for each ID from an API endpoint like https://api.example.com/items/{id}, return all the details',
    expectations: {
      minSteps: 1,
      maxSteps: 4,
      requiredStepTypes: ['tool'],
      requiredTools: ['http.request'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        httpToolsHaveRetry,
        eachHttpHasBackoff,
        usesTemplateInterpolation,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
  {
    id: 'classify-filter-sort',
    prompt: 'Fetch a list of items from an API, use an LLM to classify each item by priority (high/medium/low), filter to keep only high-priority items, sort by score descending, return the result',
    expectations: {
      minSteps: 3,
      maxSteps: 6,
      requiredStepTypes: ['tool', 'llm', 'transform'],
      requiredTools: ['http.request'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        httpToolsHaveRetry,
        llmOutputsHaveResultValue,
        transformsHaveItemsInput,
        filterStepsHaveWhere,
        sortStepsHaveDirection,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
  {
    id: 'conditional-routing',
    prompt: 'Fetch data from an API, check if the result count exceeds a threshold input, if so return a summary message, otherwise return the full data',
    expectations: {
      minSteps: 2,
      maxSteps: 6,
      requiredStepTypes: ['tool', 'conditional'],
      requiredTools: ['http.request'],
      patterns: [
        noLegacySourceField,
        retryUsesCorrectFields,
        httpToolsHaveRetry,
        eachNotOnExitOrConditional,
        workflowOutputsHaveValue,
        stepsReferencesAreValid,
      ],
    },
  },
];
