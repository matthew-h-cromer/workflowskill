/**
 * Eval setup: loads skill content and creates the Anthropic client.
 * All eval tests import from here.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

export function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// Skill content loaders
// ---------------------------------------------------------------------------

export async function loadSkillMd(): Promise<string> {
  return readFile(join(REPO_ROOT, "skill", "SKILL.md"), "utf-8");
}

export async function loadWeldablePrompt(): Promise<string> {
  return readFile(join(REPO_ROOT, "skill", "toolkits", "weldable", "prompt.md"), "utf-8");
}

/**
 * Build the system prompt used by eval tests.
 * Mirrors what .claude/skills/workflow-author/SKILL.md instructs Claude to read.
 */
export async function buildSystemPrompt(): Promise<string> {
  const [skillMd, weldablePrompt] = await Promise.all([loadSkillMd(), loadWeldablePrompt()]);

  return [
    "You are a WorkflowSkill workflow author. Your job is to generate valid YAML workflows.",
    "",
    "=== AUTHORING GUIDE (skill/SKILL.md) ===",
    skillMd,
    "",
    "=== WELDABLE TOOLKIT CONTEXT (skill/toolkits/weldable/prompt.md) ===",
    weldablePrompt,
    "",
    "When you have finished designing the workflow, call the `save_workflow` tool with the",
    "complete workflow YAML as the `content` parameter. Do not include any other text after",
    "calling the tool.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 4096;
