import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionSchema, Toolkit } from "../protocol.js";
import { ActionNotFoundError } from "../protocol.js";
import { findAction, listActionIds, toSchema } from "./registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Toolkit implementation that executes actions in-process via Weldable's
 * integration registry. Each action's `mockExecute` is called with the
 * interpreter's idempotency key as the seed, producing deterministic output
 * that matches the action's `outputFields` shape.
 *
 * No network, no credentials — works fully offline once packages are installed.
 */
export class WeldableMockToolkit implements Toolkit {
  readonly name = "weldable-mock";
  readonly description = "Weldable integration platform (mock execution)";

  async execute(
    action: string,
    args: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<unknown> {
    const entry = findAction(action);
    if (!entry) throw new ActionNotFoundError(action);

    // Open question: do mock throws model action errors or infra errors?
    // Propagate as-is for now; revisit once Weldable decides.
    return await entry.mockExecute(args, {
      seed: idempotencyKey,
      log: (msg: string) => process.stderr.write(`[${action}] ${msg}\n`),
    });
  }

  async getAuthoringContext(): Promise<string> {
    // The skill module's prompt.md is included in the published package.
    // When running from source we read from skill/toolkits/weldable/prompt.md.
    const promptPath = join(__dirname, "../../../skill/toolkits/weldable/prompt.md");
    try {
      return await readFile(promptPath, "utf-8");
    } catch {
      return "";
    }
  }

  async listActions(): Promise<ActionSchema[]> {
    return listActionIds().map((id) => {
      const action = findAction(id);
      if (!action) throw new Error(`Registry inconsistency: id "${id}" listed but not found`);
      return toSchema(action);
    });
  }

  async getAction(id: string): Promise<ActionSchema | undefined> {
    const action = findAction(id);
    return action ? toSchema(action) : undefined;
  }
}
