import kleur from "kleur";
import type { Toolkit } from "../toolkit/protocol.js";
import { loadToolkit } from "../toolkit/registry.js";

/**
 * Resolve a --toolkit name to a Toolkit instance, printing a helpful error
 * and exiting if the name is unknown.
 */
export async function resolveToolkit(name: string): Promise<Toolkit> {
  try {
    return await loadToolkit(name);
  } catch (err) {
    process.stderr.write(kleur.red(`${(err as Error).message}\n`));
    process.exit(1);
  }
}
