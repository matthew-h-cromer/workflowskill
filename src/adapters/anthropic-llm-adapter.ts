// Anthropic LLM adapter — implements ConversationalLLMAdapter using the Anthropic SDK.

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMResult,
  ConversationalLLMAdapter,
  ConversationMessage,
  ConversationTool,
  ConversationResult,
  ConversationContent,
} from '../types/index.js';

/** Model alias map: short names → full model IDs. */
const MODEL_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_CONVERSE_MODEL = 'claude-sonnet-4-6';

function resolveModel(model: string | undefined, fallback: string = DEFAULT_MODEL): string {
  if (!model) return fallback;
  return MODEL_ALIASES[model] ?? model;
}

export class AnthropicLLMAdapter implements ConversationalLLMAdapter {
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

  async converse(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
    tools?: ConversationTool[],
  ): Promise<ConversationResult> {
    // Map our message types to Anthropic SDK types
    const sdkMessages: Anthropic.MessageParam[] = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Map content blocks
      const blocks: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        // tool_result
        return {
          type: 'tool_result' as const,
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        };
      });
      return { role: msg.role, content: blocks };
    });

    // Map our tool types to Anthropic SDK types
    const sdkTools: Anthropic.Tool[] | undefined = tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const params: Anthropic.MessageCreateParams = {
      model: resolveModel(model, DEFAULT_CONVERSE_MODEL),
      max_tokens: 4096,
      system,
      messages: sdkMessages,
    };
    if (sdkTools && sdkTools.length > 0) {
      params.tools = sdkTools;
    }

    const response = await this.client.messages.create(params);

    // Map response content blocks back to our types (skip thinking blocks)
    const content: ConversationContent[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
      // Skip thinking/redacted_thinking blocks
    }

    return {
      content,
      stopReason: response.stop_reason as ConversationResult['stopReason'],
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}
