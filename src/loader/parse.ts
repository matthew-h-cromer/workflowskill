import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { WorkflowSchema } from "../schema/workflow.js";
import type { Workflow } from "../schema/workflow.js";
import { extractBody, extractFrontmatter } from "./frontmatter.js";
import { validateSteps } from "./validate.js";

export interface ParseError {
  type: "parse_error";
  message: string;
  issues?: Array<{ path: string; message: string }>;
}

export type ParseResult =
  | { ok: true; workflow: Workflow; body: string }
  | { ok: false; error: ParseError };

/**
 * Parse a workflow from a file path.
 * Only .md and .markdown files are supported. The workflow YAML must be in
 * the frontmatter block (---); the markdown body is the human-readable
 * description and is returned alongside the parsed workflow.
 */
export async function parseWorkflowFile(filePath: string): Promise<ParseResult> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      error: {
        type: "parse_error",
        message: `Cannot read file: ${filePath} — ${String(err)}`,
      },
    };
  }
  return parseWorkflowContent(content, extname(filePath));
}

/**
 * Parse a workflow from a string. `ext` must be ".md" or ".markdown".
 * The workflow YAML must appear in the frontmatter block (---).
 * Returns the parsed workflow and the markdown body text.
 */
export function parseWorkflowContent(content: string, ext = ".md"): ParseResult {
  if (ext !== ".md" && ext !== ".markdown") {
    return {
      ok: false,
      error: {
        type: "parse_error",
        message: `Unsupported file type "${ext}". Workflows must be .md files with YAML frontmatter.`,
      },
    };
  }

  const raw = extractFrontmatter(content);
  if (raw === null) {
    return {
      ok: false,
      error: {
        type: "parse_error",
        message:
          "No YAML frontmatter found. Add a --- block at the top of the file with the workflow definition.",
      },
    };
  }

  const body = extractBody(content);

  const result = WorkflowSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        type: "parse_error",
        message: "Workflow schema validation failed",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  // Additional semantic validation (id uniqueness, wait step constraints, etc.)
  const semanticErrors = validateSteps(result.data.steps);
  if (semanticErrors.length > 0) {
    return {
      ok: false,
      error: {
        type: "parse_error",
        message: "Step validation failed",
        issues: semanticErrors.map((msg) => ({ path: "steps", message: msg })),
      },
    };
  }

  return { ok: true, workflow: result.data, body };
}
