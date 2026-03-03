// WorkflowSkill type definitions
// Mirror of every field and constraint in the spec.

// ─── Primitive schema types ───────────────────────────────────────────────────

/** The set of types available in workflow schemas. */
export type SchemaType = 'string' | 'int' | 'float' | 'boolean' | 'array' | 'object';

/** Schema for a single field (workflow inputs, step inputs/outputs). */
export interface FieldSchema {
  type: SchemaType;
  /** Value: literal or $-expression. Replaces legacy `source`/`default`. */
  value?: unknown;
  /** For array types: describes element shape. */
  items?: FieldSchema;
  /** For object types: describes property shapes. */
  properties?: Record<string, SchemaType | FieldSchema>;
}

// ─── Workflow inputs and outputs ──────────────────────────────────────────────

/** Workflow-level input parameter declaration. `default` provides a fallback for optional inputs, overridable at runtime. */
export interface WorkflowInput {
  type: SchemaType;
  /** Default value for optional inputs. Overridable at runtime. */
  default?: unknown;
  /** For array types: describes element shape. */
  items?: FieldSchema;
  /** For object types: describes property shapes. */
  properties?: Record<string, SchemaType | FieldSchema>;
}

/** Workflow-level output declaration. `value` is an expression resolving to the output from final runtime context. */
export type WorkflowOutput = FieldSchema;

// ─── Step inputs and outputs ──────────────────────────────────────────────────

/** Step-level input declaration. `value` is either a literal or $-expression resolved at runtime. */
export type StepInput = FieldSchema;

/** Step-level output declaration. `value` uses $result to map from raw executor result. */
export type StepOutput = FieldSchema;

// ─── Retry policy ─────────────────────────────────────────────────────────────

/** Retry policy for a step. */
export interface RetryPolicy {
  /** Maximum number of retry attempts. */
  max: number;
  /** Delay between retries (e.g., "1s", "500ms"). */
  delay: string;
  /** Backoff multiplier applied to delay after each retry. */
  backoff: number;
}

// ─── Error handling ───────────────────────────────────────────────────────────

/** Error handling strategy for a step. */
export type OnError = 'fail' | 'ignore';

// ─── Step types ───────────────────────────────────────────────────────────────

export type StepType = 'tool' | 'transform' | 'conditional' | 'exit';

/** Transform operation kinds. */
export type TransformOperation = 'filter' | 'map' | 'sort';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** Exit statuses. */
export type ExitStatus = 'success' | 'failed';

/** Common fields shared by all step types. */
export interface StepBase {
  /** Unique identifier within the workflow. */
  id: string;
  /** Step type discriminator. */
  type: StepType;
  /** Human-readable description. */
  description?: string;
  /** What this step expects. */
  inputs: Record<string, StepInput>;
  /** What this step produces. */
  outputs: Record<string, StepOutput>;
  /** Guard condition: if false, the step is skipped and output is null. */
  condition?: string;
  /** Iterate over an array. $item and $index available inside the step. */
  each?: string;
  /** Inter-iteration delay when combined with each. Format: "1s", "500ms". */
  delay?: string;
  /** Error handling strategy. Default: fail. */
  on_error?: OnError;
  /** Retry policy. */
  retry?: RetryPolicy;
}

/** Tool step: invokes a registered tool. */
export interface ToolStep extends StepBase {
  type: 'tool';
  /** Registered tool name. */
  tool: string;
}

/** Transform step: filter, map, or sort data. */
export interface TransformFilterStep extends StepBase {
  type: 'transform';
  operation: 'filter';
  /** Expression evaluated per item; items where true are kept. */
  where: string;
}

export interface TransformMapStep extends StepBase {
  type: 'transform';
  operation: 'map';
  /** Object defining the output shape per item. Values may be expression references, literal primitives, or nested objects. */
  expression: Record<string, unknown>;
}

export interface TransformSortStep extends StepBase {
  type: 'transform';
  operation: 'sort';
  /** Dot-notation path to the field to sort by. */
  field: string;
  /** Sort direction (default: asc). */
  direction?: SortDirection;
}

export type TransformStep = TransformFilterStep | TransformMapStep | TransformSortStep;

/** Conditional step: branch based on a condition. */
export interface ConditionalStep extends StepBase {
  type: 'conditional';
  /** Expression to evaluate for branching. Overrides the common guard semantics. */
  condition: string;
  /** Step IDs to execute if condition is true. */
  then: string[];
  /** Step IDs to execute if condition is false (optional). */
  else?: string[];
}

/** Exit step: terminates the workflow. */
export interface ExitStep extends StepBase {
  type: 'exit';
  /** Termination status. */
  status: ExitStatus;
  /** Final output: expression string, or object literal (values may be expressions). */
  output?: string | Record<string, unknown>;
}

/** Union of all step types. */
export type Step = ToolStep | TransformStep | ConditionalStep | ExitStep;

// ─── Workflow definition ──────────────────────────────────────────────────────

/** The complete parsed workflow definition. */
export interface WorkflowDefinition {
  inputs: Record<string, WorkflowInput>;
  outputs: Record<string, WorkflowOutput>;
  steps: Step[];
}

/** SKILL.md frontmatter. */
export interface SkillFrontmatter {
  name: string;
  description: string;
  [key: string]: unknown;
}

/** A fully parsed skill file: frontmatter + workflow definition. */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  workflow: WorkflowDefinition;
}

// ─── Run log ──────────────────────────────────────────────────────────────────

/** Retry tracking for a step that was retried. */
export interface RetryRecord {
  /** Number of retry attempts (not counting the initial try). */
  attempts: number;
  /** Error messages from each failed attempt. */
  errors: string[];
}

/** Status of a step in the run log. */
export type StepRunStatus = 'success' | 'failed' | 'skipped';

/** A single step's record in the run log. */
export interface StepRecord {
  /** The step's declared identifier. */
  id: string;
  /** Which executor ran this step. */
  executor: StepType;
  /** Execution outcome. */
  status: StepRunStatus;
  /** Why the step was skipped (if applicable). */
  reason?: string;
  /** Wall-clock time for this step in milliseconds. */
  duration_ms: number;
  /** Resolved inputs that were passed to the executor. */
  inputs?: Record<string, unknown>;
  /** Number of iterations (if each was used). */
  iterations?: number;
  /** The step's output (may be truncated in logs). */
  output?: unknown;
  /** Error details if the step failed. */
  error?: string;
  /** Retry tracking (only present when retries occurred). */
  retries?: RetryRecord;
}

/** Aggregate summary in the run log. */
export interface RunSummary {
  steps_executed: number;
  steps_skipped: number;
  total_duration_ms: number;
}

/** Final status of a workflow run. */
export type RunStatus = 'success' | 'failed';

/** Structured error for pre-execution failures (parse or validate phases). */
export interface RunLogError {
  /** Which phase the failure occurred in. */
  phase: 'parse' | 'validate' | 'execute';
  /** Human-readable error message. */
  message: string;
  /** Detailed per-path errors (if available). */
  details?: Array<{ path: string; message: string }>;
}

/** The complete run log produced by a workflow execution. */
export interface RunLog {
  /** Unique run identifier. */
  id: string;
  /** Name of the workflow that was executed. */
  workflow: string;
  /** Final status. */
  status: RunStatus;
  /** Aggregate counts. */
  summary: RunSummary;
  /** ISO 8601 start timestamp. */
  started_at: string;
  /** ISO 8601 completion timestamp. */
  completed_at: string;
  /** Total wall-clock time in milliseconds. */
  duration_ms: number;
  /** The workflow inputs that were provided. */
  inputs: Record<string, unknown>;
  /** Ordered array of step records. */
  steps: StepRecord[];
  /** The workflow outputs that were produced. */
  outputs: Record<string, unknown>;
  /** Structured error for pre-execution failures. Present only when status is 'failed' due to parse/validate/execute errors. */
  error?: RunLogError;
}

// ─── Runtime events ───────────────────────────────────────────────────────────

/** Discriminated union of events emitted by the runtime during workflow execution. */
export type RuntimeEvent =
  | { type: 'workflow_start'; workflow: string; totalSteps: number }
  | { type: 'step_start'; stepId: string; stepType: StepType; tool?: string }
  | { type: 'step_complete'; stepId: string; status: StepRunStatus; duration_ms: number; iterations?: number }
  | { type: 'step_skip'; stepId: string; reason: string }
  | { type: 'step_retry'; stepId: string; attempt: number; error: string }
  | { type: 'step_error'; stepId: string; error: string; onError: OnError }
  | { type: 'each_progress'; stepId: string; current: number; total: number }
  | { type: 'workflow_complete'; status: RunStatus; duration_ms: number; summary: RunSummary };

// ─── Adapter interfaces ───────────────────────────────────────────────────────

/** Minimal JSON Schema type for tool parameter/output descriptions. */
export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

/** Describes a tool's name, purpose, and parameter schemas. */
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}

/** Result from a tool invocation. */
export interface ToolResult {
  output: unknown;
  error?: string;
}

/** Tool adapter interface for invoking registered tools. */
export interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Check whether a tool is available. */
  has(toolName: string): boolean;
  /** List all available tools with their metadata. Optional for backward compatibility. */
  list?(): ToolDescriptor[];
}

// ─── Runtime context ──────────────────────────────────────────────────────────

/** Runtime context available during step execution. */
export interface RuntimeContext {
  /** Workflow-level inputs. */
  inputs: Record<string, unknown>;
  /** Outputs from completed steps, keyed by step ID. */
  steps: Record<string, { output: unknown }>;
  /** Current item when inside an `each` loop. */
  item?: unknown;
  /** Current index when inside an `each` loop. */
  index?: number;
  /** Raw executor result, set during step output value mapping. */
  result?: unknown;
}

// ─── Validation errors ────────────────────────────────────────────────────────

/** A single validation error with context. */
export interface ValidationError {
  /** Which step or field the error relates to. */
  path: string;
  /** Human-readable error message. */
  message: string;
}

/** Result of workflow validation. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
