// Conversational workflow generation — multi-turn loop with tool use.
// The LLM can ask questions, research APIs, and propose before generating.

import type {
  ConversationalLLMAdapter,
  ConversationMessage,
  ConversationTool,
  ConversationContent,
  ToolAdapter,
} from '../types/index.js';
import type { GenerateResult } from './index.js';

// ─── Event types for UI rendering ──────────────────────────────────────────

export type ConversationEvent =
  | { type: 'assistant_message'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string; isError: boolean }
  | { type: 'generating' };

// ─── Options ────────────────────────────────────────────────────────────────

export interface ConversationLoopOptions {
  /** Initial user prompt. */
  initialPrompt: string;
  /** System prompt (workflow-author skill + tool descriptors). */
  systemPrompt: string;
  /** LLM adapter with converse() support. */
  llmAdapter: ConversationalLLMAdapter;
  /** Tool adapter for executing tool calls during conversation. */
  toolAdapter?: ToolAdapter;
  /** Tool definitions to pass to the LLM API. */
  conversationTools?: ConversationTool[];
  /** Callback to get user input during conversation. Return null to abort. */
  getUserInput: () => Promise<string | null>;
  /** Callback for UI events. */
  onEvent: (event: ConversationEvent) => void;
  /** Model to use for conversation. */
  model?: string;
  /** Maximum conversation turns before giving up. */
  maxTurns?: number;
  /** Maximum fix attempts when generated YAML fails validation. */
  maxFixAttempts?: number;
  /** Validation function for generated content. */
  validateGenerated: (content: string) => { valid: boolean; errors: string[] };
}

/**
 * Run a conversational generation loop.
 *
 * The LLM converses with the user (asking questions, calling tools) until it's
 * ready to generate, signaled by starting its response with `---` (frontmatter).
 */
export async function conversationalGenerate(
  options: ConversationLoopOptions,
): Promise<GenerateResult> {
  const {
    initialPrompt,
    systemPrompt,
    llmAdapter,
    toolAdapter,
    conversationTools,
    getUserInput,
    onEvent,
    model,
    maxTurns = 20,
    maxFixAttempts = 3,
    validateGenerated,
  } = options;

  const messages: ConversationMessage[] = [
    { role: 'user', content: initialPrompt },
  ];

  let fixAttempts = 0;
  let lastContent = '';
  let lastErrors: string[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await llmAdapter.converse(
      model,
      systemPrompt,
      messages,
      conversationTools,
    );

    // Append assistant response to conversation history
    messages.push({ role: 'assistant', content: response.content });

    // Handle tool use — execute tools and continue
    if (response.stopReason === 'tool_use') {
      const toolResults: ConversationContent[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        onEvent({ type: 'tool_call', name: block.name, args: block.input });

        let resultContent: string;
        let isError = false;

        if (toolAdapter && toolAdapter.has(block.name)) {
          try {
            const result = await toolAdapter.invoke(block.name, block.input);
            if (result.error) {
              resultContent = `Error: ${result.error}`;
              isError = true;
            } else {
              resultContent = typeof result.output === 'string'
                ? result.output
                : JSON.stringify(result.output);
            }
          } catch (err) {
            resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
            isError = true;
          }
        } else {
          resultContent = `Error: Tool "${block.name}" is not available`;
          isError = true;
        }

        onEvent({ type: 'tool_result', name: block.name, output: resultContent, isError });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent,
          is_error: isError,
        });
      }

      // Append tool results as a user message and continue
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Handle end_turn — check for workflow or conversation
    const text = extractText(response.content);

    if (isWorkflowAttempt(text)) {
      // Workflow generation attempt
      onEvent({ type: 'generating' });

      const content = text.trim();
      lastContent = content;

      const validation = validateGenerated(content);
      if (validation.valid) {
        return {
          content,
          valid: true,
          errors: [],
          attempts: fixAttempts + 1,
        };
      }

      // Validation failed — ask LLM to fix
      fixAttempts++;
      lastErrors = validation.errors;

      if (fixAttempts >= maxFixAttempts) {
        return {
          content: lastContent,
          valid: false,
          errors: lastErrors,
          attempts: fixAttempts,
        };
      }

      messages.push({
        role: 'user',
        content: `The generated workflow has validation errors:\n\n${lastErrors.map((e) => `- ${e}`).join('\n')}\n\nPlease fix the errors and regenerate. Start your response with \`---\` (frontmatter).`,
      });
      continue;
    }

    // Conversation message — show to user and get response
    if (text) {
      onEvent({ type: 'assistant_message', text });
    }

    const userInput = await getUserInput();
    if (userInput === null) {
      // User aborted
      return {
        content: lastContent || '',
        valid: false,
        errors: ['Generation aborted by user'],
        attempts: fixAttempts,
      };
    }

    messages.push({ role: 'user', content: userInput });
  }

  // Max turns exceeded
  return {
    content: lastContent || '',
    valid: false,
    errors: lastErrors.length > 0
      ? lastErrors
      : ['Maximum conversation turns exceeded'],
    attempts: fixAttempts,
  };
}

/** Extract concatenated text from content blocks. */
function extractText(content: ConversationContent[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Check if text starts with `---` indicating a workflow generation attempt. */
function isWorkflowAttempt(text: string): boolean {
  return text.trimStart().startsWith('---');
}
