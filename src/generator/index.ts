// Workflow generator — generates WorkflowSkill YAML from natural language descriptions.
// Uses an LLM adapter with the authoring skill prompt to produce valid YAML,
// then validates with a parse-validate-fix loop.

import type {
  LLMAdapter,
  ToolAdapter,
  ToolDescriptor,
  ConversationalLLMAdapter,
  ConversationTool,
  JsonSchema,
} from '../types/index.js';
import { parseWorkflowFromMd, ParseError } from '../parser/index.js';
import { validateWorkflow } from '../validator/index.js';
import { WORKFLOW_AUTHOR_PROMPT } from './skill-prompt.js';
import { conversationalGenerate, type ConversationEvent } from './conversation.js';

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
  /** @deprecated Use `toolDescriptors` for rich tool metadata. */
  availableTools?: string[];
  /** Tool descriptors with name, description, and parameter schemas. */
  toolDescriptors?: ToolDescriptor[];
}

/** Options for conversational workflow generation. */
export interface ConversationalGenerateOptions {
  /** Initial natural language prompt. */
  prompt: string;
  /** LLM adapter with converse() support. */
  llmAdapter: ConversationalLLMAdapter;
  /** Tool adapter for executing tool calls during conversation (read-only tools only). */
  toolAdapter?: ToolAdapter;
  /** Tool descriptors for the system prompt. */
  toolDescriptors?: ToolDescriptor[];
  /** Callback to get user input. Return null to abort. */
  getUserInput: () => Promise<string | null>;
  /** Callback for conversation events. */
  onEvent: (event: ConversationEvent) => void;
  /** Model to use for conversation (default: sonnet). */
  model?: string;
  /** Maximum conversation turns (default: 20). */
  maxTurns?: number;
  /** Maximum fix attempts on validation failure (default: 3). */
  maxFixAttempts?: number;
}

// Read-only tools that are safe to use during conversation research
const READ_ONLY_TOOLS = new Set([
  'http.request',
  'html.select',
  'gmail.search',
  'gmail.read',
  'sheets.read',
]);

/**
 * Generate a WorkflowSkill YAML from a natural language prompt.
 * Uses a generate-validate-fix loop: if the first attempt has validation errors,
 * the LLM is asked to fix them (up to maxAttempts times).
 */
export async function generateWorkflow(options: GenerateOptions): Promise<GenerateResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const systemPrompt = buildSystemPrompt(options.availableTools, options.toolDescriptors);

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
 * Generate a WorkflowSkill YAML through multi-turn conversation.
 * The LLM can ask clarifying questions, use tools for research, and propose
 * an approach before generating the final workflow.
 */
export async function generateWorkflowConversational(
  options: ConversationalGenerateOptions,
): Promise<GenerateResult> {
  const systemPrompt = buildSystemPrompt(undefined, options.toolDescriptors);

  // Build conversation tools from tool descriptors (read-only only)
  const conversationTools = buildConversationTools(options.toolDescriptors);

  return conversationalGenerate({
    initialPrompt: options.prompt,
    systemPrompt,
    llmAdapter: options.llmAdapter,
    toolAdapter: options.toolAdapter,
    conversationTools,
    getUserInput: options.getUserInput,
    onEvent: options.onEvent,
    model: options.model,
    maxTurns: options.maxTurns,
    maxFixAttempts: options.maxFixAttempts,
    validateGenerated,
  });
}

/**
 * Build the system prompt from the authoring skill.
 */
export function buildSystemPrompt(availableTools?: string[], toolDescriptors?: ToolDescriptor[]): string {
  let prompt = WORKFLOW_AUTHOR_PROMPT;

  // toolDescriptors takes precedence over availableTools
  if (toolDescriptors && toolDescriptors.length > 0) {
    prompt += '\n\n' + formatToolDescriptors(toolDescriptors);
  } else if (availableTools && availableTools.length > 0) {
    prompt += `\n\nAvailable tools: ${availableTools.join(', ')}`;
  }

  return prompt;
}

/**
 * Format tool descriptors as a readable markdown block for the LLM prompt.
 */
export function formatToolDescriptors(descriptors: ToolDescriptor[]): string {
  const lines = ['## Available Tools', ''];

  for (const tool of descriptors) {
    lines.push(`### ${tool.name}`);
    if (tool.description) {
      lines.push(tool.description);
    }

    if (tool.inputSchema?.properties) {
      const required = new Set(tool.inputSchema.required ?? []);
      lines.push('Inputs:');
      for (const [param, schema] of Object.entries(tool.inputSchema.properties)) {
        const typePart = schema.type ? ` (${schema.type}` : ' (';
        const reqPart = required.has(param) ? ', required)' : ')';
        const descPart = schema.description ? `: ${schema.description}` : '';
        lines.push(`  - ${param}${typePart}${reqPart}${descPart}`);
      }
    }

    if (tool.outputSchema?.properties) {
      lines.push('Outputs (accessible via $steps.<id>.output.<field>):');
      for (const [field, schema] of Object.entries(tool.outputSchema.properties)) {
        const typePart = schema.type ? ` (${schema.type})` : '';
        const descPart = schema.description ? `: ${schema.description}` : '';
        lines.push(`  - ${field}${typePart}${descPart}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Validate a generated SKILL.md content.
 */
export function validateGenerated(content: string): { valid: boolean; errors: string[] } {
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
    if (err instanceof ParseError && err.details.length > 0) {
      for (const detail of err.details) {
        errors.push(`${detail.path}: ${detail.message}`);
      }
    } else {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build conversation tools from tool descriptors, filtered to read-only tools only.
 */
function buildConversationTools(toolDescriptors?: ToolDescriptor[]): ConversationTool[] | undefined {
  if (!toolDescriptors || toolDescriptors.length === 0) return undefined;

  const tools: ConversationTool[] = [];
  for (const desc of toolDescriptors) {
    if (!READ_ONLY_TOOLS.has(desc.name)) continue;
    tools.push({
      name: desc.name,
      description: desc.description,
      inputSchema: desc.inputSchema ?? ({ type: 'object' } as JsonSchema),
    });
  }

  return tools.length > 0 ? tools : undefined;
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
  return response.trim();
}
