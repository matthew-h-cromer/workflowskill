import type { ActionInfo, Toolkit } from "../toolkit/protocol.js";
import { findAction, listActionIds, toActionInfo } from "../toolkit/weldable/registry.js";

/**
 * Toolkit used during `validate({ dryRun: true })`. Every action returns an
 * empty object instead of making a real call — this exercises step ordering,
 * control flow, and expression evaluation without any external side effects.
 *
 * The catalog methods (listActions/getAction) delegate to the Weldable registry
 * so the action-catalog validation pass works during dry-run without needing a
 * separate toolkit instance.
 *
 * Contrast with the conformance `nullToolkit` which *throws* — conformance
 * fixtures are required to use pure steps only, whereas author workflows
 * typically contain actions that should not abort a dry-run.
 */
export function createStubToolkit(): Toolkit {
  return {
    name: "stub",
    description: "Returns {} for every action. Used by validate() dry-run.",
    async execute(): Promise<unknown> {
      return {};
    },
    async getAuthoringContext(): Promise<string> {
      return "";
    },
    async listActions(): Promise<ActionInfo[]> {
      return listActionIds().map((id) => {
        const action = findAction(id);
        if (!action) throw new Error(`Registry inconsistency: id "${id}" listed but not found`);
        return toActionInfo(action);
      });
    },
    async getAction(id: string): Promise<ActionInfo | undefined> {
      const action = findAction(id);
      return action ? toActionInfo(action) : undefined;
    },
  };
}
