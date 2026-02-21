// Zod schemas for WorkflowSkill YAML validation.
// Isolated here so schema validation can be swapped (e.g., to TypeBox) during integration.

import { z } from 'zod';

// ─── Primitive schemas ────────────────────────────────────────────────────────

const schemaTypeEnum = z.enum(['string', 'int', 'float', 'boolean', 'array', 'object']);

// FieldSchema can be recursive (items/properties contain FieldSchema).
// We avoid deep recursion issues by using z.unknown() for nested levels.
// This is sufficient for validation — we don't need infinite depth.
const nestedFieldSchema = z.object({
  type: schemaTypeEnum,
  default: z.unknown().optional(),
  items: z.record(z.string(), z.unknown()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const fieldSchema = z.object({
  type: schemaTypeEnum,
  default: z.unknown().optional(),
  items: nestedFieldSchema.optional(),
  properties: z.record(z.string(), z.union([z.string(), nestedFieldSchema])).optional(),
});

// ─── Workflow inputs and outputs ──────────────────────────────────────────────

export const workflowInputSchema = fieldSchema;

export const workflowOutputSchema = fieldSchema;

// ─── Step inputs and outputs ──────────────────────────────────────────────────

export const stepInputSchema = fieldSchema.extend({
  source: z.string().optional(),
});

export const stepOutputSchema = fieldSchema;

// ─── Retry policy ─────────────────────────────────────────────────────────────

export const retryPolicySchema = z.object({
  max: z.number().int().positive(),
  delay: z.string(),
  backoff: z.number().positive(),
});

// ─── Common step fields ───────────────────────────────────────────────────────

const stepBaseSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['tool', 'llm', 'transform', 'conditional', 'exit']),
  description: z.string().optional(),
  inputs: z.record(z.string(), stepInputSchema).default({}),
  outputs: z.record(z.string(), stepOutputSchema).default({}),
  condition: z.string().optional(),
  each: z.string().optional(),
  on_error: z.enum(['fail', 'ignore']).optional(),
  retry: retryPolicySchema.optional(),
});

// ─── Step type schemas ────────────────────────────────────────────────────────

const toolStepSchema = stepBaseSchema.extend({
  type: z.literal('tool'),
  tool: z.string().min(1),
});

const llmStepSchema = stepBaseSchema.extend({
  type: z.literal('llm'),
  model: z.string().optional(),
  prompt: z.string().min(1),
  response_format: z.record(z.string(), z.unknown()).optional(),
});

const transformFilterStepSchema = stepBaseSchema.extend({
  type: z.literal('transform'),
  operation: z.literal('filter'),
  where: z.string().min(1),
});

const transformMapStepSchema = stepBaseSchema.extend({
  type: z.literal('transform'),
  operation: z.literal('map'),
  expression: z.record(z.string(), z.string()),
});

const transformSortStepSchema = stepBaseSchema.extend({
  type: z.literal('transform'),
  operation: z.literal('sort'),
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).optional(),
});

const conditionalStepSchema = stepBaseSchema.extend({
  type: z.literal('conditional'),
  condition: z.string().min(1),
  then: z.array(z.string()).min(1),
  else: z.array(z.string()).optional(),
});

const exitStepSchema = stepBaseSchema.extend({
  type: z.literal('exit'),
  status: z.enum(['success', 'failed']),
  output: z.string().optional(),
});

// Transform steps share type="transform" but differ by operation.
// Zod discriminatedUnion doesn't support duplicate discriminator values,
// so we use a nested discriminatedUnion for transform operations.
const transformStepSchema = z.discriminatedUnion('operation', [
  transformFilterStepSchema,
  transformMapStepSchema,
  transformSortStepSchema,
]);

// Top-level step schema: discriminate by type, with transform handled by sub-union.
export const stepSchema = z.union([
  toolStepSchema,
  llmStepSchema,
  transformStepSchema,
  conditionalStepSchema,
  exitStepSchema,
]);

// ─── Workflow definition ──────────────────────────────────────────────────────

export const workflowDefinitionSchema = z.object({
  inputs: z.record(z.string(), workflowInputSchema).default({}),
  outputs: z.record(z.string(), workflowOutputSchema).default({}),
  steps: z.array(stepSchema).min(1, 'Workflow must have at least one step'),
});

// ─── SKILL.md frontmatter ─────────────────────────────────────────────────────

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
}).passthrough();
