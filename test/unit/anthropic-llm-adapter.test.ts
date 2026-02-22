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
});
