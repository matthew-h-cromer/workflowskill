import kleur from "kleur";
import { resolveToolkit } from "./toolkit.js";

export interface IntegrationsListOptions {
  toolkit: string;
}

export async function integrationsListCommand(opts: IntegrationsListOptions): Promise<void> {
  const toolkit = await resolveToolkit(opts.toolkit);
  const actions = await toolkit.listActions();

  const integrations = [
    ...new Set(
      actions.map((a) => {
        const dot = a.id.indexOf(".");
        return dot === -1 ? a.id : a.id.slice(0, dot);
      }),
    ),
  ].sort();

  if (integrations.length === 0) {
    process.stderr.write(kleur.yellow("No integrations found\n"));
    process.exit(0);
  }

  for (const name of integrations) {
    process.stdout.write(`${name}\n`);
  }
}
