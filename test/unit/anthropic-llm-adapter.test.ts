// Tests for src/adapters/anthropic-llm-adapter.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK before importing the adapter
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
      constructor(_opts: unknown) {
        // Record the constructor call for assertions
        MockAnthropic.lastOpts = _opts;
      }
      static lastOpts: unknown;
    },
  };
});

import { AnthropicLLMAdapter } from '../../src/adapters/anthropic-llm-adapter.js';
import Anthropic from '@anthropic-ai/sdk';

describe('AnthropicLLMAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with an API key', () => {
    new AnthropicLLMAdapter('sk-test');
    expect((Anthropic as unknown as { lastOpts: unknown }).lastOpts).toEqual({ apiKey: 'sk-test' });
  });

  it('calls the API with default model (haiku) when no model specified', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello world' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const adapter = new AnthropicLLMAdapter('sk-test');
    const result = await adapter.call(undefined, 'Say hello');

    expect(createMock).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    expect(result.text).toBe('Hello world');
    expect(result.tokens).toEqual({ input: 10, output: 5 });
  });

  it('resolves model aliases', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'response' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const adapter = new AnthropicLLMAdapter('sk-test');
    await adapter.call('sonnet', 'test');

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('passes through full model IDs unchanged', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'response' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const adapter = new AnthropicLLMAdapter('sk-test');
    await adapter.call('claude-opus-4-6', 'test');

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' }),
    );
  });

  it('appends responseFormat as JSON schema instruction', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"label":"urgent"}' }],
      usage: { input_tokens: 20, output_tokens: 10 },
    });

    const adapter = new AnthropicLLMAdapter('sk-test');
    const format = { type: 'object', properties: { label: { type: 'string' } } };
    await adapter.call(undefined, 'Classify this', format);

    const call = createMock.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(call.messages[0]!.content).toContain('Respond with valid JSON matching this schema');
    expect(call.messages[0]!.content).toContain('"label"');
  });

  it('returns empty text when no text block in response', async () => {
    createMock.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 5, output_tokens: 0 },
    });

    const adapter = new AnthropicLLMAdapter('sk-test');
    const result = await adapter.call(undefined, 'test');

    expect(result.text).toBe('');
  });

  it('maps all model aliases correctly', async () => {
    const aliases = [
      ['haiku', 'claude-haiku-4-5-20251001'],
      ['sonnet', 'claude-sonnet-4-6'],
      ['opus', 'claude-opus-4-6'],
    ] as const;

    const adapter = new AnthropicLLMAdapter('sk-test');

    for (const [alias, expected] of aliases) {
      createMock.mockResolvedValueOnce({
        content: [{ type: 'text', text: '' }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });
      await adapter.call(alias, 'test');
      const call = createMock.mock.calls.at(-1)![0] as { model: string };
      expect(call.model).toBe(expected);
    }
  });

  describe('converse()', () => {
    it('sends system prompt and messages with server-side tools', async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'You are helpful.',
        [{ role: 'user', content: 'Hi' }],
      );

      expect(createMock).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
          { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 },
        ],
      });
      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.stopReason).toBe('end_turn');
      expect(result.tokens).toEqual({ input: 20, output: 10 });
    });

    it('defaults to sonnet for converse()', async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: 'text', text: '' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      await adapter.converse(undefined, 'system', [{ role: 'user', content: 'test' }]);

      const call = createMock.mock.calls[0]![0] as { model: string };
      expect(call.model).toBe('claude-sonnet-4-6');
    });

    it('includes server-side tools in every request', async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      await adapter.converse(
        'sonnet',
        'system',
        [{ role: 'user', content: 'test' }],
      );

      const call = createMock.mock.calls[0]![0] as { tools: Array<{ type: string; name: string }> };
      expect(call.tools).toHaveLength(2);
      expect(call.tools[0]!.type).toBe('web_search_20250305');
      expect(call.tools[0]!.name).toBe('web_search');
      expect(call.tools[1]!.type).toBe('web_fetch_20250910');
      expect(call.tools[1]!.name).toBe('web_fetch');
    });

    it('maps server_tool_use response blocks as server_tool content', async () => {
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: 'server_tool_use',
            id: 'srvtoolu_123',
            name: 'web_search',
            input: { query: 'test' },
          },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 15, output_tokens: 20 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'system',
        [{ role: 'user', content: 'search for test' }],
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('server_tool');
      if (result.content[0]!.type === 'server_tool') {
        const raw = result.content[0]!.raw as { type: string; name: string };
        expect(raw.type).toBe('server_tool_use');
        expect(raw.name).toBe('web_search');
      }
    });

    it('maps web_search_tool_result blocks as server_tool content', async () => {
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtoolu_123',
            content: [{ type: 'web_search_result', title: 'Test', url: 'https://example.com' }],
          },
          { type: 'text', text: 'I found some results' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 30 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'system',
        [{ role: 'user', content: 'test' }],
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0]!.type).toBe('server_tool');
      expect(result.content[1]!.type).toBe('text');
    });

    it('maps web_fetch_tool_result blocks as server_tool content', async () => {
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: 'web_fetch_tool_result',
            tool_use_id: 'srvtoolu_456',
            content: { type: 'web_fetch_result', url: 'https://example.com', content: '<html>test</html>' },
          },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'system',
        [{ role: 'user', content: 'fetch example.com' }],
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('server_tool');
    });

    it('passes server_tool blocks through in message history', async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Got it!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 30, output_tokens: 5 },
      });

      const serverToolRaw = {
        type: 'server_tool_use',
        id: 'srvtoolu_789',
        name: 'web_search',
        input: { query: 'test' },
      };

      const adapter = new AnthropicLLMAdapter('sk-test');
      await adapter.converse(
        undefined,
        'system',
        [
          { role: 'user', content: 'search something' },
          {
            role: 'assistant',
            content: [{ type: 'server_tool', raw: serverToolRaw }],
          },
        ],
      );

      const call = createMock.mock.calls[0]![0] as { messages: Array<{ role: string; content: unknown }> };
      expect(call.messages).toHaveLength(2);
      // Server tool block should be passed through as-is (the raw value)
      const assistantMsg = call.messages[1]!;
      expect(assistantMsg.role).toBe('assistant');
      const blocks = assistantMsg.content as Array<{ type: string }>;
      expect(blocks[0]!.type).toBe('server_tool_use');
    });

    it('skips thinking blocks in response', async () => {
      createMock.mockResolvedValueOnce({
        content: [
          { type: 'thinking', thinking: 'internal thought' },
          { type: 'text', text: 'visible response' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'system',
        [{ role: 'user', content: 'test' }],
      );

      expect(result.content).toEqual([{ type: 'text', text: 'visible response' }]);
    });

    it('maps pause_turn stop reason', async () => {
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: 'server_tool_use',
            id: 'srvtoolu_001',
            name: 'web_search',
            input: { query: 'long running search' },
          },
        ],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const adapter = new AnthropicLLMAdapter('sk-test');
      const result = await adapter.converse(
        undefined,
        'system',
        [{ role: 'user', content: 'search something' }],
      );

      expect(result.stopReason).toBe('pause_turn');
    });
  });
});
