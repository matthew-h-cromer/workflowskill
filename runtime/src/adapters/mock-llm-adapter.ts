// Mock LLM adapter for testing.
// Returns configurable responses without making real API calls.
// Implements StreamingLLMAdapter so converseStream() is always available.

import type {
  LLMResult,
  ConversationMessage,
  ConversationResult,
  StreamEvent,
  StreamingConversation,
  StreamingLLMAdapter,
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

export type StreamingConversationHandler = (
  model: string | undefined,
  system: string,
  messages: ConversationMessage[],
) => StreamingConversation;

export class MockLLMAdapter implements StreamingLLMAdapter {
  private handler: LLMHandler;
  private conversationHandler?: ConversationHandler;
  private streamingHandler?: StreamingConversationHandler;

  constructor(
    handler?: LLMHandler,
    conversationHandler?: ConversationHandler,
    streamingHandler?: StreamingConversationHandler,
  ) {
    this.handler = handler ?? (() => ({
      text: 'mock response',
      tokens: { input: 10, output: 5 },
    }));
    this.conversationHandler = conversationHandler;
    this.streamingHandler = streamingHandler;
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

  converseStream(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
  ): StreamingConversation {
    if (this.streamingHandler) {
      return this.streamingHandler(model, system, messages);
    }
    // Default: synthesize a stream from converse() result
    const resultPromise = this.converse(model, system, messages);

    async function* synthesize(): AsyncGenerator<StreamEvent> {
      const result = await resultPromise;
      for (const block of result.content) {
        if (block.type === 'text') {
          yield { type: 'text_delta', delta: block.text };
        }
      }
      yield { type: 'done' };
    }

    return {
      events: synthesize(),
      result: resultPromise,
    };
  }
}
