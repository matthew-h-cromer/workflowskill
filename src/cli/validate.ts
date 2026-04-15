import { readFile } from "node:fs/promises";
import kleur from "kleur";
import { validate } from "../validate/index.js";
import type { Issue } from "../validate/index.js";
import { resolveToolkit } from "./toolkit.js";

export interface ValidateCommandOptions {
  toolkit: string;
  dryRun: boolean;
  json: boolean;
}

export async function validateCommand(
  filePath: string,
  opts: ValidateCommandOptions,
): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    process.stderr.write(kleur.red(`Cannot read file "${filePath}": ${(err as Error).message}\n`));
    process.exit(1);
  }

  const toolkit = await resolveToolkit(opts.toolkit);

  const result = await validate(content, {
    toolkit,
    dryRun: opts.dryRun,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (result.ok) {
    process.stdout.write(`${kleur.green("ok")}  ${filePath}\n`);
    process.exit(0);
  }

  // Print issues
  for (const issue of result.issues) {
    process.stdout.write(`${renderIssue(issue)}\n`);
  }

  const count = result.issues.length;
  process.stdout.write(kleur.red(`\n${count} issue${count === 1 ? "" : "s"}\n`));
  process.exit(1);
}

function renderIssue(issue: Issue): string {
  const severity = issue.severity === "error" ? kleur.red("error") : kleur.yellow("warning");
  const code = kleur.dim(issue.code);
  const path = issue.path ? kleur.cyan(issue.path) : "";
  const sep = path ? ": " : "";
  return `${severity}  ${code}  ${path}${sep}${issue.message}`;
}
