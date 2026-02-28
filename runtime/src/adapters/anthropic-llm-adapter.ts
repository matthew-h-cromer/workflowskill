// Anthropic LLM adapter — implements LLMAdapter using the Anthropic SDK.

import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, LLMResult } from '../types/index.js';

/** Model alias map: short names → full model IDs. */
const MODEL_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function resolveModel(model: string | undefined, fallback: string = DEFAULT_MODEL): string {
  if (!model) return fallback;
  return MODEL_ALIASES[model] ?? model;
}

export class AnthropicLLMAdapter implements LLMAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async call(
    model: string | undefined,
    prompt: string,
    responseFormat?: Record<string, unknown>,
  ): Promise<LLMResult> {
    let fullPrompt = prompt;

    // If responseFormat is specified, append schema instruction
    if (responseFormat && Object.keys(responseFormat).length > 0) {
      fullPrompt += `\n\nRespond with valid JSON matching this schema: ${JSON.stringify(responseFormat)}`;
    }

    const response = await this.client.messages.create({
      model: resolveModel(model),
      max_tokens: 4096,
      messages: [{ role: 'user', content: fullPrompt }],
    });

    // Extract text from first text content block
    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      text,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}
