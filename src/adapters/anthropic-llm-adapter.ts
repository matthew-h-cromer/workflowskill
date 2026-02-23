// Anthropic LLM adapter — implements StreamingLLMAdapter using the Anthropic SDK.
// Uses server-side tools (web_search, web_fetch) for research during generation conversations.
// Supports both blocking converse() and streaming converseStream() for real-time output.

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMResult,
  ConversationMessage,
  ConversationResult,
  ConversationContent,
  StreamEvent,
  StreamingConversation,
  StreamingLLMAdapter,
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

/** Server-side tools included in every converse() call. */
const SERVER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 },
];

/**
 * Map a raw Anthropic SDK content block to our ConversationContent type.
 * Recognized block types (text, tool_use) map to their typed variants.
 * Server-side blocks (server_tool_use, web_search_tool_result, web_fetch_tool_result)
 * are passed through as opaque ServerToolContent.
 * Unrecognized blocks (thinking, redacted_thinking, etc.) are skipped.
 */
function mapContentBlock(block: Anthropic.Messages.ContentBlock): ConversationContent | null {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    };
  }
  // Server-side tool blocks — pass through as opaque
  if (
    block.type === 'server_tool_use' ||
    block.type === 'web_search_tool_result' ||
    block.type === 'web_fetch_tool_result'
  ) {
    return { type: 'server_tool', raw: block };
  }
  // Skip thinking/redacted_thinking/other blocks
  return null;
}

/**
 * Map a ConversationContent block back to an Anthropic SDK ContentBlockParam
 * for sending in multi-turn message history.
 */
function mapContentToParam(block: ConversationContent): Anthropic.Messages.ContentBlockParam {
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
  if (block.type === 'tool_result') {
    return {
      type: 'tool_result' as const,
      tool_use_id: block.tool_use_id,
      content: block.content,
      is_error: block.is_error,
    };
  }
  // server_tool — pass the raw block back as-is
  return block.raw as Anthropic.Messages.ContentBlockParam;
}

export class AnthropicLLMAdapter implements StreamingLLMAdapter {
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
  ): Promise<ConversationResult> {
    // Map our message types to Anthropic SDK types
    const sdkMessages: Anthropic.MessageParam[] = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Map content blocks
      const blocks: Anthropic.Messages.ContentBlockParam[] = msg.content.map(mapContentToParam);
      return { role: msg.role, content: blocks };
    });

    const response = await this.client.messages.create({
      model: resolveModel(model, DEFAULT_CONVERSE_MODEL),
      max_tokens: 4096,
      system,
      messages: sdkMessages,
      tools: SERVER_TOOLS,
    });

    // Map response content blocks back to our types
    const content: ConversationContent[] = [];
    for (const block of response.content) {
      const mapped = mapContentBlock(block);
      if (mapped) content.push(mapped);
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

  converseStream(
    model: string | undefined,
    system: string,
    messages: ConversationMessage[],
  ): StreamingConversation {
    const sdkMessages: Anthropic.MessageParam[] = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      const blocks: Anthropic.Messages.ContentBlockParam[] = msg.content.map(mapContentToParam);
      return { role: msg.role, content: blocks };
    });

    const stream = this.client.messages.stream({
      model: resolveModel(model, DEFAULT_CONVERSE_MODEL),
      max_tokens: 4096,
      system,
      messages: sdkMessages,
      tools: SERVER_TOOLS,
    });

    const events = streamToEvents(stream);

    const result = stream.finalMessage().then((msg): ConversationResult => {
      const content: ConversationContent[] = [];
      for (const block of msg.content) {
        const mapped = mapContentBlock(block);
        if (mapped) content.push(mapped);
      }
      return {
        content,
        stopReason: msg.stop_reason as ConversationResult['stopReason'],
        tokens: {
          input: msg.usage.input_tokens,
          output: msg.usage.output_tokens,
        },
      };
    });

    return { events, result };
  }
}

/** Convert a MessageStream's raw SSE events into our StreamEvent type. */
async function* streamToEvents(
  stream: AsyncIterable<Anthropic.MessageStreamEvent>,
): AsyncGenerator<StreamEvent> {
  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      const block = event.content_block;
      const blockType = block.type;
      const entry: StreamEvent = { type: 'block_start', index: event.index, blockType };
      // Attach name/input for server_tool_use blocks
      if (blockType === 'server_tool_use' && 'name' in block) {
        (entry as { name?: string }).name = (block as { name: string }).name;
        (entry as { input?: Record<string, unknown> }).input = (block as { input: Record<string, unknown> }).input;
      }
      yield entry;
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        yield { type: 'text_delta', delta: delta.text };
      } else if (delta.type === 'thinking_delta') {
        yield { type: 'thinking_delta', delta: delta.thinking };
      }
      // Skip input_json_delta, citations_delta, signature_delta
    } else if (event.type === 'content_block_stop') {
      yield { type: 'block_stop', index: event.index };
    }
  }
  yield { type: 'done' };
}
