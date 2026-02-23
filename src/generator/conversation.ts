// Conversational workflow generation — multi-turn loop with server-side tools.
// The LLM can ask questions, use web_search/web_fetch for research, and propose before generating.
// Server-side tools are handled entirely by Anthropic's servers — no local execution needed.

import type {
  ConversationalLLMAdapter,
  ConversationMessage,
  ConversationContent,
} from '../types/index.js';
import type { GenerateResult } from './index.js';

// ─── Event types for UI rendering ──────────────────────────────────────────

export type ConversationEvent =
  | { type: 'assistant_message'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string; isError: boolean }
  | { type: 'generating' }
  | { type: 'workflow_generated'; content: string; valid: boolean; errors: string[] };

// ─── Options ────────────────────────────────────────────────────────────────

export interface ConversationLoopOptions {
  /** Initial user prompt. */
  initialPrompt: string;
  /** System prompt (workflow-author skill + tool descriptors). */
  systemPrompt: string;
  /** LLM adapter with converse() support. */
  llmAdapter: ConversationalLLMAdapter;
  /** Callback to get user input during conversation. Return null to abort. */
  getUserInput: () => Promise<string | null>;
  /** Callback for UI events. */
  onEvent: (event: ConversationEvent) => void;
  /** Model to use for conversation. */
  model?: string;
  /** Maximum conversation turns before giving up. */
  maxTurns?: number;
  /** Validation function for generated content. */
  validateGenerated: (content: string) => { valid: boolean; errors: string[] };
}

/**
 * Run a conversational generation loop.
 *
 * The LLM converses with the user (asking questions, using server-side tools for research)
 * until it's ready to generate, signaled by starting its response with `---` (frontmatter).
 * Server-side tools (web_search, web_fetch) are handled by Anthropic's servers — the adapter
 * returns their results as opaque blocks that are passed through in conversation history.
 */
export async function conversationalGenerate(
  options: ConversationLoopOptions,
): Promise<GenerateResult> {
  const {
    initialPrompt,
    systemPrompt,
    llmAdapter,
    getUserInput,
    onEvent,
    model,
    maxTurns = 20,
    validateGenerated,
  } = options;

  const messages: ConversationMessage[] = [
    { role: 'user', content: initialPrompt },
  ];

  let attempts = 0;
  let lastContent = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await llmAdapter.converse(
      model,
      systemPrompt,
      messages,
    );

    // Append assistant response to conversation history
    messages.push({ role: 'assistant', content: response.content });

    // Emit events for server-side tool blocks (for UI visibility)
    for (const block of response.content) {
      if (block.type === 'server_tool') {
        const raw = block.raw as { type?: string; name?: string; input?: unknown };
        if (raw.type === 'server_tool_use' && raw.name) {
          onEvent({ type: 'tool_call', name: raw.name, args: (raw.input ?? {}) as Record<string, unknown> });
        }
        if (raw.type === 'web_search_tool_result' || raw.type === 'web_fetch_tool_result') {
          const toolName = raw.type === 'web_search_tool_result' ? 'web_search' : 'web_fetch';
          onEvent({ type: 'tool_result', name: toolName, output: '[server-side result]', isError: false });
        }
      }
    }

    // Handle pause_turn — server-side tool is still running, continue the loop
    if (response.stopReason === 'pause_turn') {
      // Pass assistant response back as-is and continue (no user input needed)
      continue;
    }

    // Handle end_turn — check for workflow or conversation
    const text = extractText(response.content);
    const extracted = extractWorkflowText(text);

    if (extracted) {
      // Workflow generation attempt
      onEvent({ type: 'generating' });

      const content = extracted.workflow;
      lastContent = content;
      attempts++;

      const validation = validateGenerated(content);

      // Emit commentary before the workflow if present
      if (extracted.commentary) {
        onEvent({ type: 'assistant_message', text: extracted.commentary });
      }

      // Emit workflow_generated so CLI can write file immediately
      onEvent({
        type: 'workflow_generated',
        content,
        valid: validation.valid,
        errors: validation.errors,
      });

      // Ask user for confirmation — empty/null accepts, non-empty iterates
      const confirmInput = await getUserInput();
      if (confirmInput === null || confirmInput.trim() === '') {
        return {
          content,
          valid: validation.valid,
          errors: validation.errors,
          attempts,
        };
      }

      // User wants iteration — push feedback and continue loop
      messages.push({
        role: 'user',
        content: confirmInput,
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
        attempts,
      };
    }

    messages.push({ role: 'user', content: userInput });
  }

  // Max turns exceeded
  return {
    content: lastContent || '',
    valid: false,
    errors: ['Maximum conversation turns exceeded'],
    attempts,
  };
}

/** Extract concatenated text from content blocks. */
function extractText(content: ConversationContent[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Find a SKILL.md document (frontmatter + workflow block) anywhere in the response text. */
function extractWorkflowText(text: string): { workflow: string; commentary: string } | null {
  const fmMatch = text.match(/(^|\n)(---\n)/);
  if (!fmMatch) return null;
  const fmIndex = fmMatch.index! + fmMatch[1]!.length;
  const candidate = text.slice(fmIndex);
  if (/^---\n[\s\S]*?\n---/.test(candidate) && /```workflow\s*\n/.test(candidate)) {
    return { workflow: candidate.trim(), commentary: text.slice(0, fmIndex).trim() };
  }
  return null;
}
