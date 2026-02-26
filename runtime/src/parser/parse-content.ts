// Internal parse helper shared by runWorkflowSkill and validateWorkflowSkill.
// Not exported from the barrel — internal use only.
//
// Tries parseSkillMd first (full SKILL.md with frontmatter), then falls back
// to parseWorkflowFromMd (bare workflow YAML block). Returns a discriminated
// union so callers never need to catch.

import { parseSkillMd, parseWorkflowFromMd, ParseError } from './index.js';
import type { WorkflowDefinition } from '../types/index.js';

export type ParseContentResult =
  | { ok: true; workflow: WorkflowDefinition; name: string | undefined }
  | { ok: false; message: string; details?: Array<{ path: string; message: string }> };

/**
 * Parse content that is either a full SKILL.md or a bare workflow YAML block.
 * Never throws — failures are encoded in the returned union.
 */
export function parseContent(content: string): ParseContentResult {
  if (!content.trim()) {
    return { ok: false, message: 'Content is empty' };
  }

  // Try full SKILL.md (with frontmatter) first
  try {
    const skill = parseSkillMd(content);
    return { ok: true, workflow: skill.workflow, name: skill.frontmatter.name };
  } catch {
    // Fall through to bare workflow YAML
  }

  // Fall back to bare workflow block
  try {
    const workflow = parseWorkflowFromMd(content);
    return { ok: true, workflow, name: undefined };
  } catch (err) {
    let message: string;
    let details: Array<{ path: string; message: string }> | undefined;
    if (err instanceof ParseError) {
      message = err.message;
      details = err.details.length > 0 ? err.details : undefined;
    } else {
      message = err instanceof Error ? err.message : String(err);
    }
    return { ok: false, message, details };
  }
}
