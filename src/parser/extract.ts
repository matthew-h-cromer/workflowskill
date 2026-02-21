// Extract ```workflow fenced code block and YAML frontmatter from SKILL.md content.

/** Result of extracting content from a SKILL.md file. */
export interface ExtractResult {
  frontmatter: string | null;
  workflowYaml: string;
}

/**
 * Extract YAML frontmatter from SKILL.md content.
 * Frontmatter is delimited by --- at the start of the file.
 */
export function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? null;
}

/**
 * Extract the ```workflow fenced code block from SKILL.md content.
 * Returns the YAML content inside the block.
 * Throws if no workflow block is found.
 */
export function extractWorkflowBlock(content: string): string {
  // Match ```workflow ... ``` block
  const match = content.match(/```workflow\s*\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new ExtractError(
      'No ```workflow fenced code block found in SKILL.md. ' +
      'WorkflowSkill definitions must be wrapped in a ```workflow block.'
    );
  }
  return match[1];
}

/**
 * Extract both frontmatter and workflow block from SKILL.md content.
 */
export function extract(content: string): ExtractResult {
  return {
    frontmatter: extractFrontmatter(content),
    workflowYaml: extractWorkflowBlock(content),
  };
}

/** Error thrown during extraction. */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}
