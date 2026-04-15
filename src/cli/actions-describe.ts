import kleur from "kleur";
import type { ActionInfo } from "../toolkit/protocol.js";
import { resolveToolkit } from "./toolkit.js";

export interface ActionsDescribeOptions {
  toolkit: string;
  json: boolean;
}

export async function actionsDescribeCommand(
  actionId: string,
  opts: ActionsDescribeOptions,
): Promise<void> {
  const toolkit = await resolveToolkit(opts.toolkit);
  const action = await toolkit.getAction(actionId);

  if (!action) {
    process.stderr.write(
      kleur.red(`Action "${actionId}" not found in toolkit "${opts.toolkit}"\n`),
    );
    process.exit(2);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(action, null, 2)}\n`);
    return;
  }

  renderHuman(action);
}

/**
 * Render an ActionInfo in human-readable form.
 *
 * This format is intentionally stable — it is parsed by the workflow-author
 * skill during the self-heal loop. Do not change formatting without updating
 * the skill prompt and golden tests.
 *
 * Format:
 *   ID          <id>
 *   DESCRIPTION <description>
 *
 *   INPUTS
 *     <name> <type>[*][=<default>]  — <description>  [options: a, b, c]
 *     ...
 *
 *   OUTPUTS
 *     <name> <type>  — <description>
 *     ...
 *
 */
export function renderHuman(action: ActionInfo): void {
  process.stdout.write(`ID          ${action.id}\n`);
  process.stdout.write(`DESCRIPTION ${action.description}\n`);

  if (action.intents && action.intents.length > 0) {
    process.stdout.write(`INTENTS     ${action.intents.join(" | ")}\n`);
  }

  process.stdout.write("\n");
  process.stdout.write("INPUTS\n");

  if (action.inputFields.length === 0) {
    process.stdout.write("  (none)\n");
  } else {
    for (const field of action.inputFields) {
      const required = field.required ? "*" : "";
      const def = field.default !== undefined ? `=${JSON.stringify(field.default)}` : "";
      const nameType = `${field.name} ${field.type}${required}${def}`;
      const desc = field.description ? `  — ${field.description}` : "";
      const opts =
        field.options && field.options.length > 0
          ? `  [options: ${field.options.map((o) => o.value).join(", ")}]`
          : "";
      process.stdout.write(`  ${nameType}${desc}${opts}\n`);
    }
  }

  process.stdout.write("\n");
  process.stdout.write("OUTPUTS\n");

  const outputFields = action.outputFields ?? [];
  if (outputFields.length === 0) {
    process.stdout.write("  (none)\n");
  } else {
    for (const field of outputFields) {
      const desc = field.description ? `  — ${field.description}` : "";
      process.stdout.write(`  ${field.name} ${field.type}${desc}\n`);
    }
  }
}
