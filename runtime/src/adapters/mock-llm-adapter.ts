// Mock LLM adapter for testing.
// Returns configurable responses without making real API calls.

import type { LLMAdapter, LLMResult } from '../types/index.js';

export type LLMHandler = (
  model: string | undefined,
  prompt: string,
  responseFormat?: Record<string, unknown>,
) => LLMResult | Promise<LLMResult>;

export class MockLLMAdapter implements LLMAdapter {
  private handler: LLMHandler;

  constructor(handler?: LLMHandler) {
    this.handler = handler ?? (() => ({
      text: 'mock response',
      tokens: { input: 10, output: 5 },
    }));
  }

  async call(
    model: string | undefined,
    prompt: string,
    responseFormat?: Record<string, unknown>,
  ): Promise<LLMResult> {
    return this.handler(model, prompt, responseFormat);
  }
}
