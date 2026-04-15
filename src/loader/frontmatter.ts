import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Extract the YAML frontmatter from a .workflow.md file.
 * Returns the parsed object, or null if no frontmatter is found.
 */
export function extractFrontmatter(content: string): unknown {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;
  const yamlText = match[1] ?? "";
  return parseYaml(yamlText);
}

/**
 * Extract the markdown body (text after the closing ---) from a .workflow.md file.
 * Returns an empty string if no frontmatter is found or the body is empty.
 */
export function extractBody(content: string): string {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return "";
  return content.slice(match[0].length).trimStart();
}
