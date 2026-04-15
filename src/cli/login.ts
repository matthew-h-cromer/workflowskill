import kleur from "kleur";

/**
 * Login info — no login required for mock execution.
 */
export async function login(): Promise<void> {
  process.stdout.write(`\n${kleur.bold("Weldable login")}\n\n`);
  process.stdout.write(
    `${kleur.green("No login required")} for mock execution. ` +
      `${kleur.cyan("workflowskill run")} executes actions locally against bundled mock handlers.\n\n`,
  );
  process.stdout.write(
    "Real execution happens only after publishing your workflow to Weldable.\n\n",
  );
}
