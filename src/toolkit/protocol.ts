// ---------------------------------------------------------------------------
// Action schema types (serializable — no execute/mockExecute handlers)
// ---------------------------------------------------------------------------

export interface ActionFieldSchema {
  name: string;
  /** Matches @weldable/integration-core InputField.type */
  type: "string" | "text" | "number" | "boolean" | "object" | "array" | "enum";
  required: boolean;
  description?: string;
  default?: unknown;
  /** Enum values. Only present when type === "enum". */
  options?: Array<{ label: string; value: string }>;
}

export interface ActionOutputFieldSchema {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
}

export interface ActionSchema {
  /** Composite id, e.g. "gmail.search" */
  id: string;
  name: string;
  description: string;
  intents?: string[];
  preview?: string;
  inputFields: ActionFieldSchema[];
  outputFields: ActionOutputFieldSchema[];
}

// ---------------------------------------------------------------------------
// Toolkit interface
// ---------------------------------------------------------------------------

/**
 * Toolkit protocol. A toolkit translates action names + args into
 * integration calls against a specific platform.
 *
 * The `WeldableMockToolkit` implementation dispatches actions in-process via imported Weldable integration packages.
 */
export interface Toolkit {
  readonly name: string;
  readonly description: string;

  /**
   * Execute an action by name with resolved args.
   *
   * @param action   The action name, e.g. "gmail.search" or "slack.post_message"
   * @param args     Resolved (interpolated) args dict
   * @param idempotencyKey  Derived from run_id + step path. Pass in headers when
   *                        the integration supports idempotency (Stripe, Square, etc.)
   */
  execute(action: string, args: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;

  /**
   * Return the toolkit-specific authoring context (e.g. weldable/prompt.md).
   * Used by the eval harness to inject platform context into LLM prompts.
   */
  getAuthoringContext(): Promise<string>;

  /**
   * Return schema metadata for every action this toolkit supports.
   * Used for static workflow validation and CLI action discovery.
   */
  listActions(): Promise<ActionSchema[]>;

  /**
   * Return schema metadata for a single action by its composite id (e.g. "gmail.search").
   * Returns undefined when the action is not registered in this toolkit.
   */
  getAction(id: string): Promise<ActionSchema | undefined>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class IntegrationNotConnectedError extends Error {
  constructor(
    public readonly action: string,
    public readonly connectUrl: string,
  ) {
    super(`Integration for "${action}" is not connected. Connect at: ${connectUrl}`);
    this.name = "IntegrationNotConnectedError";
  }
}

export class ActionNotFoundError extends Error {
  constructor(public readonly action: string) {
    super(`Action "${action}" not found in the toolkit`);
    this.name = "ActionNotFoundError";
  }
}

export class ActionArgsError extends Error {
  constructor(
    public readonly action: string,
    public readonly missingArgs: string[],
  ) {
    super(`Action "${action}" requires args: ${missingArgs.join(", ")}`);
    this.name = "ActionArgsError";
  }
}
