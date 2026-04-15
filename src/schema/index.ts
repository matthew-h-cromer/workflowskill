// Version
export { WORKFLOW_VERSION } from "./version.js";
export type { WorkflowVersion } from "./version.js";

// Expressions and duration types
export {
  JsonataExprSchema,
  DurationSchema,
  RateLimitPerSchema,
  parseDurationMs,
  parseRateLimitPerMs,
} from "./expressions.js";
export type { JsonataExpr, Duration, RateLimitPer } from "./expressions.js";

// Step schemas and types
export {
  RetryPolicySchema,
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
  StepSchema,
} from "./steps.js";
export type {
  RetryPolicy,
  ActionStep,
  TransformStep,
  IfStep,
  SwitchStep,
  ForeachStep,
  WhileStep,
  ParallelStep,
  TryStep,
  WaitStep,
  WaitForSignalStep,
  ReturnStep,
  Step,
  OnTimeout,
} from "./steps.js";

// Workflow schema and types
export {
  InputSpecSchema,
  OutputSpecSchema,
  WorkflowSchema,
} from "./workflow.js";
export type { InputSpec, InputType, OutputSpec, Workflow } from "./workflow.js";

// JSON Schema generator
export { generateWorkflowJsonSchema } from "./json-schema.js";

// Error types
export { isWorkflowError, toWorkflowError } from "./errors.js";
export type { WorkflowError } from "./errors.js";
