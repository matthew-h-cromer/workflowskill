// Workflow generator — generates WorkflowSkill YAML from natural language descriptions.
// Uses an LLM adapter with the authoring skill prompt to produce valid YAML,
// then validates with a parse-validate-fix loop.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LLMAdapter } from '../types/index.js';
import { parseWorkflowFromMd } from '../parser/index.js';
import { validateWorkflow } from '../validator/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Result of workflow generation. */
export interface GenerateResult {
  /** The generated SKILL.md content. */
  content: string;
  /** Whether the generated workflow is valid. */
  valid: boolean;
  /** Validation errors (if any). */
  errors: string[];
  /** Number of generation attempts. */
  attempts: number;
}

/** Options for workflow generation. */
export interface GenerateOptions {
  /** Natural language description of the desired workflow. */
  prompt: string;
  /** LLM adapter for generation. */
  llmAdapter: LLMAdapter;
  /** Maximum generation + fix attempts. */
  maxAttempts?: number;
  /** Available tool names for context. */
  availableTools?: string[];
}

/**
 * Generate a WorkflowSkill YAML from a natural language prompt.
 * Uses a generate-validate-fix loop: if the first attempt has validation errors,
 * the LLM is asked to fix them (up to maxAttempts times).
 */
export async function generateWorkflow(options: GenerateOptions): Promise<GenerateResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const systemPrompt = buildSystemPrompt(options.availableTools);

  let lastContent = '';
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userPrompt = attempt === 1
      ? options.prompt
      : buildFixPrompt(lastContent, lastErrors, options.prompt);

    const result = await options.llmAdapter.call(undefined, `${systemPrompt}\n\nUser request: ${userPrompt}`);
    const content = extractWorkflowContent(result.text);
    lastContent = content;

    // Validate
    const validation = validateGenerated(content);
    if (validation.valid) {
      return {
        content,
        valid: true,
        errors: [],
        attempts: attempt,
      };
    }

    lastErrors = validation.errors;
  }

  // Return last attempt with errors
  return {
    content: lastContent,
    valid: false,
    errors: lastErrors,
    attempts: maxAttempts,
  };
}

/**
 * Build the system prompt from the authoring skill.
 */
function buildSystemPrompt(availableTools?: string[]): string {
  let prompt: string;
  try {
    prompt = readFileSync(
      join(__dirname, '../../skills/workflow-author/SKILL.md'),
      'utf-8',
    );
  } catch {
    // Fallback if skill file not found (e.g., in tests)
    prompt = getInlineSystemPrompt();
  }

  if (availableTools && availableTools.length > 0) {
    prompt += `\n\nAvailable tools: ${availableTools.join(', ')}`;
  }

  return prompt;
}

/**
 * Build a fix prompt when validation fails.
 */
function buildFixPrompt(
  previousContent: string,
  errors: string[],
  originalPrompt: string,
): string {
  return `The previous attempt to generate a workflow for "${originalPrompt}" had validation errors:

${errors.map((e) => `- ${e}`).join('\n')}

Previous output:
${previousContent}

Please fix the errors and regenerate a valid WorkflowSkill YAML.`;
}

/**
 * Extract workflow content from LLM response.
 * The LLM may return just YAML, or a full SKILL.md with frontmatter.
 */
function extractWorkflowContent(response: string): string {
  // If response contains frontmatter, treat as full SKILL.md
  if (response.includes('---\n') && response.includes('```workflow')) {
    return response.trim();
  }

  // If response contains just a workflow block, wrap in SKILL.md format
  if (response.includes('```workflow')) {
    return `---\nname: generated-workflow\ndescription: Generated workflow\n---\n\n# Generated Workflow\n\n${response.trim()}\n`;
  }

  // If response is raw YAML, wrap it
  return `---\nname: generated-workflow\ndescription: Generated workflow\n---\n\n# Generated Workflow\n\n\`\`\`workflow\n${response.trim()}\n\`\`\`\n`;
}

/**
 * Validate a generated SKILL.md content.
 */
function validateGenerated(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Parse
  try {
    const workflow = parseWorkflowFromMd(content);

    // Validate
    const result = validateWorkflow(workflow);
    if (!result.valid) {
      for (const err of result.errors) {
        errors.push(`${err.path}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Inline system prompt fallback when the skill file isn't available.
 */
function getInlineSystemPrompt(): string {
  return `You are a workflow authoring assistant. Generate valid WorkflowSkill YAML definitions.

A WorkflowSkill has:
- inputs: typed parameters (type: string | int | float | boolean | array | object)
- outputs: typed results
- steps: ordered sequence of tool, llm, transform, conditional, or exit steps

Step types:
- tool: invoke a registered tool. Fields: tool (name)
- llm: call a language model. Fields: model (optional), prompt (template with $references)
- transform: filter/map/sort data. Fields: operation + where/expression/field
- conditional: branch execution. Fields: condition, then, else
- exit: terminate early. Fields: status (success|failed), output

Wire steps with $references: $inputs.name, $steps.<id>.output.field, $item, $index

Output format: SKILL.md with frontmatter (---name/description---) and \`\`\`workflow block.

Rules:
- Minimize LLM steps (use tools/transforms when possible)
- Steps execute in order; only reference earlier steps
- Use each for per-item processing
- Add retry for external API calls
- Add on_error: ignore for non-critical steps`;
}
