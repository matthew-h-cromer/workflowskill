import { z } from "zod";
import type { WorkflowError } from "./errors.js";
import { DurationSchema, RateLimitPerSchema } from "./expressions.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const RetryPolicySchema = z.object({
  max_attempts: z.number().int().min(1),
  backoff: z.enum(["exponential", "linear", "fixed"]).default("exponential"),
  on: z.array(z.string()).optional(),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

const RateLimitSchema = z.object({
  max: z.number().int().min(1),
  per: RateLimitPerSchema,
});

// ---------------------------------------------------------------------------
// Step type interfaces (defined first to break circular inference)
// ---------------------------------------------------------------------------

export interface ActionStep {
  type: "action";
  id: string;
  description: string;
  uses: string;
  with?: Record<string, unknown> | undefined;
  retry?: RetryPolicy | undefined;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface TransformStep {
  type: "transform";
  id: string;
  description: string;
  expr: string;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface IfStep {
  type: "if";
  id: string;
  description: string;
  when: string;
  then: Step[];
  else?: Step[] | undefined;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface SwitchStep {
  type: "switch";
  id: string;
  description: string;
  on: string;
  cases: Record<string, Step[]>;
  default?: Step[] | undefined;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface ForeachStep {
  type: "foreach";
  id: string;
  description: string;
  items: string;
  as: string;
  concurrency: number;
  rate_limit?: { max: number; per: "1s" | "1m" | "1h" } | undefined;
  body: Step[];
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface WhileStep {
  type: "while";
  id: string;
  description: string;
  when: string;
  max_iterations: number;
  rate_limit?: { max: number; per: "1s" | "1m" | "1h" } | undefined;
  body: Step[];
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface ParallelStep {
  type: "parallel";
  id: string;
  description: string;
  branches: Record<string, Step[]>;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface TryStep {
  type: "try";
  id: string;
  description: string;
  body: Step[];
  catch?: Step[] | undefined;
  finally?: Step[] | undefined;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export interface WaitStep {
  type: "wait";
  id: string;
  description: string;
  duration?: string | undefined;
  until?: string | undefined;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export type OnTimeout = "abort" | "continue" | "escalate";

export interface WaitForSignalStep {
  type: "wait_for_signal";
  id: string;
  description: string;
  signal: string;
  match?: Record<string, string> | undefined;
  timeout: string;
  on_timeout: OnTimeout;
  continue_on_error: boolean;
}

export interface ReturnStep {
  type: "return";
  id: string;
  description: string;
  value: string;
  timeout?: string | undefined;
  continue_on_error: boolean;
}

export type Step =
  | ActionStep
  | TransformStep
  | IfStep
  | SwitchStep
  | ForeachStep
  | WhileStep
  | ParallelStep
  | TryStep
  | WaitStep
  | WaitForSignalStep
  | ReturnStep;

// ---------------------------------------------------------------------------
// Base props (id, timeout, continue_on_error — no retry)
// ---------------------------------------------------------------------------

const baseProps = {
  id: z.string(),
  description: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[^\n\r]+$/, "must be a single line of 80 characters or fewer"),
  timeout: DurationSchema.optional(),
  continue_on_error: z.boolean().default(false),
};

// ---------------------------------------------------------------------------
// Step schemas
//
// For leaf (non-recursive) schemas we let Zod infer types normally.
// For recursive schemas (those containing Step[] body fields) we use
// z.ZodType<T, ZodTypeDef, unknown> to (a) break the circular inference and
// (b) check only the _output_ type against our interface (ignoring _input_
// so ZodDefault's `T | undefined` input doesn't conflict with `T` interface).
// ---------------------------------------------------------------------------

export const ActionStepSchema = z.object({
  ...baseProps,
  type: z.literal("action"),
  uses: z.string(),
  with: z.record(z.unknown()).optional(),
  retry: RetryPolicySchema.optional(),
});

export const TransformStepSchema = z.object({
  ...baseProps,
  type: z.literal("transform"),
  expr: z.string(),
});

// Lazy step array for recursive schemas
const StepArraySchema: z.ZodType<Step[], z.ZodTypeDef, unknown> = z.lazy(() => z.array(StepSchema));

export const IfStepSchema: z.ZodType<IfStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("if"),
    when: z.string(),
    then: StepArraySchema,
    else: StepArraySchema.optional(),
  }),
);

export const SwitchStepSchema: z.ZodType<SwitchStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("switch"),
    on: z.string(),
    cases: z.record(StepArraySchema),
    default: StepArraySchema.optional(),
  }),
);

export const ForeachStepSchema: z.ZodType<ForeachStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("foreach"),
    items: z.string(),
    as: z.string(),
    concurrency: z.number().int().min(1).default(1),
    rate_limit: RateLimitSchema.optional(),
    body: StepArraySchema,
  }),
);

export const WhileStepSchema: z.ZodType<WhileStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("while"),
    when: z.string(),
    max_iterations: z.number().int().min(1),
    rate_limit: RateLimitSchema.optional(),
    body: StepArraySchema,
  }),
);

export const ParallelStepSchema: z.ZodType<ParallelStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("parallel"),
    branches: z.record(StepArraySchema),
  }),
);

export const TryStepSchema: z.ZodType<TryStep, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    ...baseProps,
    type: z.literal("try"),
    body: StepArraySchema,
    catch: StepArraySchema.optional(),
    finally: StepArraySchema.optional(),
  }),
);

// WaitStep: duration XOR until — exactly one must be set.
// Safe to use .refine because StepSchema is a z.union (not z.discriminatedUnion),
// which accepts ZodEffects members.
export const WaitStepSchema = z
  .object({
    ...baseProps,
    type: z.literal("wait"),
    duration: DurationSchema.optional(),
    until: z.string().optional(),
  })
  .refine((s) => (s.duration !== undefined) !== (s.until !== undefined), {
    message: "Wait step requires exactly one of 'duration' or 'until'",
  });

export const WaitForSignalStepSchema = z.object({
  ...baseProps,
  type: z.literal("wait_for_signal"),
  signal: z.string(),
  match: z.record(z.string()).optional(),
  timeout: DurationSchema,
  on_timeout: z.enum(["abort", "continue", "escalate"]).default("abort"),
});

export const ReturnStepSchema = z.object({
  ...baseProps,
  type: z.literal("return"),
  value: z.string(),
});

// ---------------------------------------------------------------------------
// Discriminated union — uses z.ZodType<Step> to break circular inference.
// We use z.union (not z.discriminatedUnion) because lazy schemas are not
// compatible with discriminatedUnion's constraint on the option types.
// ---------------------------------------------------------------------------

export const StepSchema: z.ZodType<Step, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    ActionStepSchema,
    TransformStepSchema,
    IfStepSchema,
    SwitchStepSchema,
    ForeachStepSchema,
    WhileStepSchema,
    ParallelStepSchema,
    TryStepSchema,
    WaitStepSchema,
    WaitForSignalStepSchema,
    ReturnStepSchema,
  ] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]),
);
