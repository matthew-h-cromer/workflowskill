import kleur from "kleur";

export type StepEvent =
  | { type: "step_start"; path: string; stepType: string; label?: string }
  | { type: "step_complete"; path: string; label?: string }
  | { type: "step_error"; path: string; error: string }
  | { type: "signal_waiting"; signal: string };

export class Display {
  private activeIterations = new Map<string, Set<string>>(); // foreachPath → active iter paths

  emit(event: StepEvent): void {
    switch (event.type) {
      case "step_start":
        process.stdout.write(
          `  ${kleur.dim("→")} ${event.label ? kleur.white(event.label) : kleur.cyan(event.stepType)} ${kleur.dim(event.path)}\n`,
        );
        break;

      case "step_complete":
        process.stdout.write(
          `  ${kleur.green("✓")} ${kleur.dim(event.path)}${event.label ? ` ${kleur.dim(event.label)}` : ""}\n`,
        );
        break;

      case "step_error":
        process.stdout.write(
          `  ${kleur.red("✗")} ${kleur.dim(event.path)} ${kleur.red(event.error)}\n`,
        );
        break;

      case "signal_waiting":
        process.stdout.write(
          `  ${kleur.yellow("⏳")} Waiting for signal: ${kleur.cyan(event.signal)}\n`,
        );
        break;
    }
  }

  workflowStart(name: string): void {
    process.stdout.write(`\n${kleur.bold(name)}\n${kleur.dim("─".repeat(name.length))}\n`);
  }

  workflowComplete(outputs: Record<string, unknown>): void {
    process.stdout.write(`\n${kleur.green("✓ Workflow complete")}\n`);
    if (Object.keys(outputs).length > 0) {
      process.stdout.write(kleur.dim("Output:\n"));
      process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
    }
  }

  workflowError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\n${kleur.red("✗ Workflow failed:")} ${msg}\n`);
  }
}
