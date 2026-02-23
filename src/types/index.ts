// WorkflowSkill type definitions
// Mirror of every field and constraint in the RFC spec.

// ─── Primitive schema types ───────────────────────────────────────────────────

/** The set of types available in workflow schemas. */
export type SchemaType = 'string' | 'int' | 'float' | 'boolean' | 'array' | 'object';

/** Schema for a single field (workflow inputs, step inputs/outputs). */
export interface FieldSchema {
  type: SchemaType;
  /** Default value for optional fields. */
  default?: unknown;
  /** For array types: describes element shape. */
  items?: FieldSchema;
  /** For object types: describes property shapes. */
  properties?: Record<string, SchemaType | FieldSchema>;
}

// ─── Workflow inputs and outputs ──────────────────────────────────────────────

/** Workflow-level input parameter declaration. */
export interface WorkflowInput extends FieldSchema {
  /** Default value makes this input optional. */
  default?: unknown;
}

/** Workflow-level output declaration. */
export interface WorkflowOutput extends FieldSchema {
  /** Expression that resolves to the output value from the final runtime context. */
  source?: string;
}

// ─── Step inputs and outputs ──────────────────────────────────────────────────

/** Step-level input declaration. Includes an expression source for wiring. */
export interface StepInput extends FieldSchema {
  /** Expression that resolves to the value at runtime (e.g., $steps.fetch.output.messages). */
  source?: string;
}

/** Step-level output declaration. */
export interface StepOutput extends FieldSchema {
  /** Expression using $output to map from the raw executor result. */
  source?: string;
}

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

export type StepType = 'tool' | 'llm' | 'transform' | 'conditional' | 'exit';

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

/** LLM step: calls a language model. */
export interface LLMStep extends StepBase {
  type: 'llm';
  /** Model identifier (optional, falls back to platform default). */
  model?: string;
  /** Prompt template with $-expression interpolation. */
  prompt: string;
  /** Structured output hint (optional). */
  response_format?: Record<string, unknown>;
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
  /** Object defining the output shape per item. */
  expression: Record<string, string>;
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
export type Step = ToolStep | LLMStep | TransformStep | ConditionalStep | ExitStep;

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

/** Token usage for an LLM step. */
export interface TokenUsage {
  input: number;
  output: number;
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
  /** Number of iterations (if each was used). */
  iterations?: number;
  /** Token counts (LLM steps only). */
  tokens?: TokenUsage;
  /** The step's output (may be truncated in logs). */
  output?: unknown;
  /** Error details if the step failed. */
  error?: string;
}

/** Aggregate summary in the run log. */
export interface RunSummary {
  steps_executed: number;
  steps_skipped: number;
  total_tokens: number;
  total_duration_ms: number;
}

/** Final status of a workflow run. */
export type RunStatus = 'success' | 'failed';

/** The complete run log produced by a workflow execution. */
export interface RunLog {
  /** Unique run identifier. */
  id: string;
  /** Name of the workflow that was executed. */
  workflow: string;
  /** Final status. */
  status: RunStatus;
  /** ISO 8601 start timestamp. */
  started_at: string;
  /** ISO 8601 completion timestamp. */
  completed_at: string;
  /** Total wall-clock time in milliseconds. */
  duration_ms: number;
  /** The workflow inputs that were provided. */
  inputs: Record<string, unknown>;
  /** The workflow outputs that were produced. */
  outputs: Record<string, unknown>;
  /** Ordered array of step records. */
  steps: StepRecord[];
  /** Aggregate counts. */
  summary: RunSummary;
}

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

/** Result from an LLM call. */
export interface LLMResult {
  text: string;
  tokens: TokenUsage;
}

/** LLM adapter interface for calling language models. */
export interface LLMAdapter {
  call(model: string | undefined, prompt: string, responseFormat?: Record<string, unknown>): Promise<LLMResult>;
}

// ─── Conversation types ────────────────────────────────────────────────────

/** Text content block in a conversation message. */
export interface TextContent { type: 'text'; text: string }

/** Tool use content block — the assistant wants to call a tool. */
export interface ToolUseContent { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

/** Tool result content block — the result of a tool invocation. */
export interface ToolResultContent { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** Opaque passthrough for server-side tool blocks (web_search, web_fetch results etc.). */
export interface ServerToolContent { type: 'server_tool'; raw: unknown }

/** Union of all content block types in a conversation message. */
export type ConversationContent = TextContent | ToolUseContent | ToolResultContent | ServerToolContent

/** A single message in a multi-turn conversation. */
export interface ConversationMessage { role: 'user' | 'assistant'; content: string | ConversationContent[] }

/** Result from a converse() call. */
export interface ConversationResult {
  content: ConversationContent[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'pause_turn'
  tokens: TokenUsage
}

/** Extended LLM adapter with multi-turn conversation support. */
export interface ConversationalLLMAdapter extends LLMAdapter {
  converse(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
  ): Promise<ConversationResult>
}

// ─── Streaming types ─────────────────────────────────────────────────────────

/** Streaming event from the adapter during a conversation turn. */
export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'block_start'; index: number; blockType: string; name?: string; input?: Record<string, unknown> }
  | { type: 'block_stop'; index: number }
  | { type: 'done' }

/** Handle for a streaming conversation turn. */
export interface StreamingConversation {
  events: AsyncIterable<StreamEvent>
  result: Promise<ConversationResult>
}

/** Adapter that supports streaming responses. */
export interface StreamingLLMAdapter extends ConversationalLLMAdapter {
  converseStream(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
  ): StreamingConversation
}

/** Runtime type guard: does this adapter support streaming? */
export function isStreamingAdapter(
  adapter: ConversationalLLMAdapter
): adapter is StreamingLLMAdapter {
  return 'converseStream' in adapter && typeof (adapter as Record<string, unknown>).converseStream === 'function';
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
  /** Raw executor result, set during step output source mapping. */
  output?: unknown;
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
