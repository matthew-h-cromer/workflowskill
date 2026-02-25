// WorkflowSkill parser: SKILL.md → typed WorkflowDefinition
// Pipeline: extract markdown → parse YAML → validate with Zod → typed objects

import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { extract, extractWorkflowBlock, ExtractError } from './extract.js';
import { workflowDefinitionSchema, skillFrontmatterSchema } from './schema.js';
import type { WorkflowDefinition, ParsedSkill, SkillFrontmatter } from '../types/index.js';

/** Error thrown when parsing fails. Includes structured details. */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly details: ParseErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface ParseErrorDetail {
  path: string;
  message: string;
}

/**
 * Convert Zod errors to our ParseErrorDetail format.
 */
function zodToDetails(err: ZodError): ParseErrorDetail[] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Parse a raw YAML string into a validated WorkflowDefinition.
 * Use this when you already have the YAML content (e.g., from extractWorkflowBlock).
 */
export function parseWorkflowYaml(yaml: string): WorkflowDefinition {
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (err) {
    throw new ParseError(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = workflowDefinitionSchema.safeParse(raw);
  if (!result.success) {
    throw new ParseError(
      'Workflow validation failed',
      zodToDetails(result.error),
    );
  }

  // Zod discriminatedUnion handles step type validation, but transform steps
  // need the discriminatedUnion on 'type' first and then we rely on Zod for
  // operation-specific fields. Cast is safe because Zod validated the shape.
  return result.data as unknown as WorkflowDefinition;
}

/**
 * Parse a SKILL.md file content into a fully typed ParsedSkill.
 * Extracts frontmatter and workflow block, validates both.
 */
export function parseSkillMd(content: string): ParsedSkill {
  let extracted;
  try {
    extracted = extract(content);
  } catch (err) {
    if (err instanceof ExtractError) {
      throw new ParseError(err.message);
    }
    throw err;
  }

  // Parse frontmatter
  let frontmatter: SkillFrontmatter;
  if (extracted.frontmatter) {
    let rawFrontmatter: unknown;
    try {
      rawFrontmatter = parseYaml(extracted.frontmatter);
    } catch (err) {
      throw new ParseError(`Invalid frontmatter YAML: ${err instanceof Error ? err.message : String(err)}`);
    }
    const fmResult = skillFrontmatterSchema.safeParse(rawFrontmatter);
    if (!fmResult.success) {
      throw new ParseError('Frontmatter validation failed', zodToDetails(fmResult.error));
    }
    frontmatter = fmResult.data as SkillFrontmatter;
  } else {
    throw new ParseError('SKILL.md must have YAML frontmatter with name and description');
  }

  // Parse workflow
  const workflow = parseWorkflowYaml(extracted.workflowYaml);

  return { frontmatter, workflow };
}

/**
 * Parse just the workflow block from SKILL.md content.
 * Useful when you only need the workflow definition without frontmatter.
 */
export function parseWorkflowFromMd(content: string): WorkflowDefinition {
  let yaml;
  try {
    yaml = extractWorkflowBlock(content);
  } catch (err) {
    if (err instanceof ExtractError) {
      throw new ParseError(err.message);
    }
    throw err;
  }
  return parseWorkflowYaml(yaml);
}

// Re-export extract utilities
export { extractWorkflowBlock, extractFrontmatter } from './extract.js';
