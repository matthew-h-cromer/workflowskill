import { z } from "zod";
import { StepSchema } from "./steps.js";
import { WORKFLOW_VERSION } from "./version.js";

// ---------------------------------------------------------------------------
// Input / Output spec
// ---------------------------------------------------------------------------

const InputTypeSchema = z.enum(["string", "number", "boolean", "object", "array"]);
export type InputType = z.infer<typeof InputTypeSchema>;

export const InputSpecSchema = z.object({
  type: InputTypeSchema,
  default: z.unknown().optional(),
  description: z.string().optional(),
});
export type InputSpec = z.infer<typeof InputSpecSchema>;

// outputs are {{ expr }} string values
export const OutputSpecSchema = z.record(z.string());
export type OutputSpec = z.infer<typeof OutputSpecSchema>;

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

// `name` and `description` inherit the Agent Skills standard constraints
// (agentskills.io): `name` is lowercase letters, numbers, and hyphens,
// max 64 chars, and may not contain the reserved words "anthropic" or
// "claude"; `description` is non-empty, max 1024 chars.
const NameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "must contain only lowercase letters, numbers, and hyphens")
  .refine(
    (v) => !/anthropic|claude/.test(v),
    'must not contain reserved words "anthropic" or "claude"',
  );

const DescriptionSchema = z.string().min(1).max(1024);

export const WorkflowSchema = z.object({
  version: z.literal(WORKFLOW_VERSION),
  name: NameSchema,
  description: DescriptionSchema,
  inputs: z.record(InputSpecSchema).optional(),
  outputs: OutputSpecSchema.optional(),
  steps: z.array(StepSchema).min(1),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
