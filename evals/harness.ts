/**
 * Eval harness: drives the LLM tool loop and extracts the generated workflow.
 *
 * The harness provides:
 *   - `save_workflow`       — capture the finished workflow file
 *   - `list_actions`        — full in-process action catalog ({id, description})
 *   - `describe_action`     — full schema for one action (inputs, outputs, preview)
 *   - `validate_workflow`   — in-process static validator with dry-run
 *
 * All tools run in-process against the Weldable mock registry — no network,
 * no credentials, no MCP server required.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { getCurrentTest } from "vitest/suite";
import { parseWorkflowContent } from "../src/loader/parse.js";
import type { Workflow } from "../src/schema/workflow.js";
import { WeldableMockToolkit } from "../src/toolkit/weldable/mock.js";
import { validate } from "../src/validate/index.js";
import { MAX_TOKENS, MODEL, buildSystemPrompt, createClient } from "./setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "snapshots");
const REGENERATE = process.env.EVAL_REGENERATE === "1";

// ---------------------------------------------------------------------------
// Shared toolkit instance (reused across tool calls within one eval run)
// ---------------------------------------------------------------------------

const toolkit = new WeldableMockToolkit();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const SAVE_WORKFLOW_TOOL: Anthropic.Tool = {
  name: "save_workflow",
  description:
    "Save the completed workflow file. Call this once when the workflow is ready. " +
    "The file must be a .workflow.md file: YAML frontmatter (between --- delimiters) " +
    "contains the full workflow definition, and the markdown body below the closing --- " +
    "is a plain-language description of what the workflow does.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The complete .workflow.md file content: YAML frontmatter with the workflow " +
          "definition (including steps with description fields), followed by --- and a " +
          "markdown body describing the workflow in plain language.",
      },
      path: {
        type: "string",
        description: "Suggested file path (e.g. workflows/my-workflow.workflow.md)",
      },
    },
    required: ["content"],
  },
};

const LIST_ACTIONS_TOOL: Anthropic.Tool = {
  name: "list_actions",
  description:
    "List every action available in the Weldable toolkit as `{id, description}` pairs. " +
    "Scan the full list once to pick the action ids you need — there is no keyword search.",
  input_schema: { type: "object", properties: {} },
};

const DESCRIBE_ACTION_TOOL: Anthropic.Tool = {
  name: "describe_action",
  description:
    "Describe a single action: full input field schema, output field schema, and preview template. " +
    "Call this before using an action to confirm its exact input names and types.",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Exact action id (e.g. 'slack.post_message')",
      },
    },
    required: ["id"],
  },
};

const VALIDATE_WORKFLOW_TOOL: Anthropic.Tool = {
  name: "validate_workflow",
  description:
    "Validate a workflow definition against the action catalog, check expressions, " +
    "and optionally execute a mock dry-run. " +
    "Call this after writing the workflow to catch errors before saving. " +
    "Iterate: fix each issue reported, then re-validate until result.ok is true.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The complete .workflow.md file content to validate.",
      },
      dry_run: {
        type: "boolean",
        description:
          "If true, also execute the workflow with mock actions to catch runtime errors. Default: true.",
      },
    },
    required: ["content"],
  },
};

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleListActions(): Promise<string> {
  const actions = await toolkit.listActions();
  return JSON.stringify(
    actions.map((a) => ({ id: a.id, description: a.description })),
    null,
    2,
  );
}

async function handleDescribeAction(input: Record<string, unknown>): Promise<string> {
  const id = String(input.id ?? "");
  if (!id) return JSON.stringify({ error: "describe_action requires an id" });
  const action = await toolkit.getAction(id);
  if (!action) {
    return JSON.stringify({
      error: `Action "${id}" not found. Call list_actions to see available ids.`,
    });
  }
  return JSON.stringify(action, null, 2);
}

async function handleValidateWorkflow(input: Record<string, unknown>): Promise<string> {
  const content = String(input.content ?? "");
  const dryRun = input.dry_run !== false; // default true

  const result = await validate(content, { toolkit, dryRun });
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EvalRunOptions {
  /**
   * Max number of tool-loop turns to allow before giving up.
   * Default: 15
   */
  maxTurns?: number;

  /**
   * If true, print the full conversation to stderr for debugging.
   */
  verbose?: boolean;
}

export interface EvalRunResult {
  /** The raw .workflow.md content from save_workflow, or null if the model never called it. */
  rawContent: string | null;

  /** Parsed workflow, or null if rawYaml is null or failed to parse. */
  workflow: Workflow | null;

  /** Parse error message if parsing failed. */
  parseError: string | null;

  /** Number of API turns consumed. */
  turns: number;
}

/**
 * Run the authoring eval for a given task description.
 *
 * Spins up a tool loop with the system prompt + task, lets the model use
 * `save_workflow`, `list_actions`, `describe_action`, and `validate_workflow`, and returns
 * the captured workflow content + parsed Workflow object.
 */
function snapshotPathForCurrentTest(): string | null {
  const test = getCurrentTest();
  if (!test) return null;
  const testName = `${test.suite?.name ?? ""} ${test.name}`;
  const slug = testName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return join(SNAPSHOTS_DIR, `${slug}.workflow.md`);
}

export async function runEval(task: string, opts: EvalRunOptions = {}): Promise<EvalRunResult> {
  const { maxTurns = 15, verbose = false } = opts;

  const snapshotPath = snapshotPathForCurrentTest();

  // Default: read the committed snapshot. Only call the API when EVAL_REGENERATE=1.
  if (!REGENERATE && snapshotPath) {
    try {
      const rawContent = await readFile(snapshotPath, "utf-8");
      return parseAndReturn(rawContent, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // Snapshot missing — fail fast rather than silently hitting the API.
      throw new Error(
        `Eval snapshot not found: ${snapshotPath}\n` +
          "Run EVAL_REGENERATE=1 pnpm eval to generate it.",
      );
    }
  }

  const client = createClient();
  const systemPrompt = await buildSystemPrompt();

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  let rawContent: string | null = null;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: [SAVE_WORKFLOW_TOOL, LIST_ACTIONS_TOOL, DESCRIBE_ACTION_TOOL, VALIDATE_WORKFLOW_TOOL],
      messages,
    });

    if (verbose) {
      process.stderr.write(`[eval] turn ${turns} stop_reason=${response.stop_reason}\n`);
      for (const block of response.content) {
        if (block.type === "text") {
          process.stderr.write(`[eval] text: ${block.text.slice(0, 200)}\n`);
        } else if (block.type === "tool_use") {
          process.stderr.write(
            `[eval] tool_use: ${block.name} ${JSON.stringify(block.input).slice(0, 200)}\n`,
          );
        }
      }
    }

    // Add assistant turn
    messages.push({ role: "assistant", content: response.content });

    // If stop_reason is end_turn with no tools, the model is done but didn't save
    if (response.stop_reason === "end_turn") break;

    // Build tool results for next turn
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "save_workflow") {
        const input = block.input as { content?: string; path?: string };
        const content = input.content ?? "";
        // Validate before accepting — reject invalid workflows so the model fixes them
        const validation = await handleValidateWorkflow({ content, dry_run: false });
        const validationResult = JSON.parse(validation) as { ok: boolean; issues?: unknown[] };
        if (!validationResult.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({
              ok: false,
              error: "Workflow failed validation. Fix the issues and call save_workflow again.",
              validation: validationResult,
            }),
          });
        } else {
          rawContent = content;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ ok: true, path: input.path }),
          });
        }
      } else if (block.name === "list_actions") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await handleListActions(),
        });
      } else if (block.name === "describe_action") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await handleDescribeAction(block.input as Record<string, unknown>),
        });
      } else if (block.name === "validate_workflow") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await handleValidateWorkflow(block.input as Record<string, unknown>),
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
        });
      }
    }

    // If save_workflow succeeded, we're done
    if (rawContent !== null) break;

    if (toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  if (REGENERATE && rawContent !== null && snapshotPath) {
    await mkdir(SNAPSHOTS_DIR, { recursive: true });
    await writeFile(snapshotPath, rawContent, "utf-8");
  }

  return parseAndReturn(rawContent, turns);
}

function parseAndReturn(rawContent: string | null, turns: number): EvalRunResult {
  let workflow: Workflow | null = null;
  let parseError: string | null = null;

  if (rawContent !== null) {
    const result = parseWorkflowContent(rawContent, ".md");
    if (result.ok) {
      workflow = result.workflow;
    } else {
      parseError = result.error.message;
      if (result.error.issues) {
        parseError += `\n${result.error.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`;
      }
    }
  }

  return { rawContent, workflow, parseError, turns };
}
