import kleur from "kleur";
import { resolveToolkit } from "./toolkit.js";

export interface ActionsListOptions {
  toolkit: string;
}

export async function actionsListCommand(
  opts: ActionsListOptions,
  integrations: string[],
): Promise<void> {
  const toolkit = await resolveToolkit(opts.toolkit);
  let actions = await toolkit.listActions();

  if (integrations.length > 0) {
    const prefixes = integrations.map((i) => (i.endsWith(".") ? i : `${i}.`));
    actions = actions.filter((a) => prefixes.some((p) => a.id.startsWith(p)));
    if (actions.length === 0) {
      const names = integrations.join(", ");
      process.stderr.write(kleur.yellow(`No actions found for integration(s): ${names}\n`));
      process.exit(0);
    }
  }

  // Group by integration prefix for readability
  const byIntegration = new Map<string, typeof actions>();
  for (const action of actions) {
    const dot = action.id.indexOf(".");
    const integ = dot === -1 ? action.id : action.id.slice(0, dot);
    if (!byIntegration.has(integ)) byIntegration.set(integ, []);
    byIntegration.get(integ)?.push(action);
  }

  for (const [integ, group] of byIntegration) {
    process.stdout.write(`${kleur.bold().cyan(integ)}\n`);
    for (const action of group) {
      process.stdout.write(`  ${kleur.green(action.id.padEnd(48))}  ${action.description}\n`);
    }
    process.stdout.write("\n");
  }
}
