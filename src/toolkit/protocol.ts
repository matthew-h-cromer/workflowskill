import type { Action, InputField, OutputField } from "@weldable/integration-core";

// ---------------------------------------------------------------------------
// Action info types — serializable descriptors (no execute/mockExecute handlers)
// ---------------------------------------------------------------------------

/**
 * Extends integration-core's InputField with workflowskill-specific validation
 * metadata. When @weldable/integration-core adds `schema` to InputField this
 * interface collapses to a type alias.
 */
export interface ActionInputField extends InputField {
  /**
   * Optional JSON Schema (draft 2020-12) the literal arg value must satisfy.
   * Validated with ajv during `workflowskill validate`. Skipped when the value
   * contains `{{ }}` spans (runtime-resolved).
   */
  schema?: unknown;
}

/** Direct alias for OutputField — no divergence needed. */
export type ActionOutputField = OutputField;

/**
 * Serializable descriptor for a single action: identity, field definitions,
 * and optional metadata. Runtime handlers (execute/mockExecute) are stripped.
 *
 * Named "Info" to distinguish from Zod schemas (which use the Schema suffix
 * throughout this codebase).
 */
export type ActionInfo = Omit<Action, "execute" | "mockExecute"> & {
  inputFields: ActionInputField[];
};

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
  listActions(): Promise<ActionInfo[]>;

  /**
   * Return schema metadata for a single action by its composite id (e.g. "gmail.search").
   * Returns undefined when the action is not registered in this toolkit.
   */
  getAction(id: string): Promise<ActionInfo | undefined>;
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
