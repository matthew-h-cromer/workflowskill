// Mock LLM adapter for testing.
// Returns configurable responses without making real API calls.

import type {
  LLMResult,
  ConversationalLLMAdapter,
  ConversationMessage,
  ConversationResult,
} from '../types/index.js';

export type LLMHandler = (
  model: string | undefined,
  prompt: string,
  responseFormat?: Record<string, unknown>,
) => LLMResult | Promise<LLMResult>;

export type ConversationHandler = (
  model: string | undefined,
  system: string,
  messages: ConversationMessage[],
) => ConversationResult | Promise<ConversationResult>;

export class MockLLMAdapter implements ConversationalLLMAdapter {
  private handler: LLMHandler;
  private conversationHandler?: ConversationHandler;

  constructor(handler?: LLMHandler, conversationHandler?: ConversationHandler) {
    this.handler = handler ?? (() => ({
      text: 'mock response',
      tokens: { input: 10, output: 5 },
    }));
    this.conversationHandler = conversationHandler;
  }

  async call(
    model: string | undefined,
    prompt: string,
    responseFormat?: Record<string, unknown>,
  ): Promise<LLMResult> {
    return this.handler(model, prompt, responseFormat);
  }

  async converse(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
  ): Promise<ConversationResult> {
    if (this.conversationHandler) {
      return this.conversationHandler(model, system, messages);
    }
    // Default: delegate to call() and wrap as ConversationResult
    const lastMessage = messages[messages.length - 1];
    const prompt = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : lastMessage?.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n') ?? '';
    const result = await this.call(model, prompt);
    return {
      content: [{ type: 'text', text: result.text }],
      stopReason: 'end_turn',
      tokens: result.tokens,
    };
  }
}
