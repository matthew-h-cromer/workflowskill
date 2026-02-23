import { describe, it, expect } from 'vitest';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';
import type { ConversationResult } from '../../src/types/index.js';
import { isStreamingAdapter } from '../../src/types/index.js';

describe('MockToolAdapter', () => {
  it('list() returns empty array when no tools registered', () => {
    const adapter = new MockToolAdapter();
    expect(adapter.list()).toEqual([]);
  });

  it('register() without descriptor creates minimal descriptor', () => {
    const adapter = new MockToolAdapter();
    adapter.register('my.tool', () => ({ output: 'ok' }));

    const descriptors = adapter.list();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toEqual({ name: 'my.tool', description: '' });
  });

  it('register() with descriptor stores full metadata', () => {
    const adapter = new MockToolAdapter();
    adapter.register('gmail.search', () => ({ output: [] }), {
      description: 'Search Gmail messages by query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'integer', description: 'Maximum results to return' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'array',
        items: { type: 'object' },
      },
    });

    const descriptors = adapter.list();
    expect(descriptors).toHaveLength(1);
    const d = descriptors[0]!;
    expect(d.name).toBe('gmail.search');
    expect(d.description).toBe('Search Gmail messages by query.');
    expect(d.inputSchema?.properties?.query).toEqual({
      type: 'string',
      description: 'The search query',
    });
    expect(d.outputSchema).toBeDefined();
  });

  it('list() returns all registered descriptors', () => {
    const adapter = new MockToolAdapter();
    adapter.register('tool_a', () => ({ output: 'a' }), {
      description: 'Tool A',
    });
    adapter.register('tool_b', () => ({ output: 'b' }), {
      description: 'Tool B',
      inputSchema: { type: 'object' },
    });
    adapter.register('tool_c', () => ({ output: 'c' }));

    const descriptors = adapter.list();
    expect(descriptors).toHaveLength(3);
    expect(descriptors.map((d) => d.name)).toEqual(['tool_a', 'tool_b', 'tool_c']);
  });

  it('has() works after refactor', () => {
    const adapter = new MockToolAdapter();
    adapter.register('exists', () => ({ output: true }));

    expect(adapter.has('exists')).toBe(true);
    expect(adapter.has('missing')).toBe(false);
  });

  it('invoke() works after refactor', async () => {
    const adapter = new MockToolAdapter();
    adapter.register('echo', (args) => ({ output: args }), {
      description: 'Echoes input',
    });

    const result = await adapter.invoke('echo', { msg: 'hello' });
    expect(result.output).toEqual({ msg: 'hello' });
    expect(result.error).toBeUndefined();
  });

  it('invoke() returns error for unregistered tool', async () => {
    const adapter = new MockToolAdapter();
    const result = await adapter.invoke('missing', {});
    expect(result.error).toContain('not registered');
  });
});

describe('MockLLMAdapter', () => {
  it('converse() delegates to call() when no conversationHandler', async () => {
    const adapter = new MockLLMAdapter(() => ({
      text: 'hello from call',
      tokens: { input: 5, output: 3 },
    }));

    const result = await adapter.converse(undefined, 'system', [
      { role: 'user', content: 'hi' },
    ]);

    expect(result.stopReason).toBe('end_turn');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    if (result.content[0]!.type === 'text') {
      expect(result.content[0]!.text).toBe('hello from call');
    }
  });

  it('converse() uses conversationHandler when provided', async () => {
    const conversationResult: ConversationResult = {
      content: [{ type: 'tool_use', id: 'call_1', name: 'test.tool', input: {} }],
      stopReason: 'tool_use',
      tokens: { input: 10, output: 10 },
    };

    const adapter = new MockLLMAdapter(undefined, () => conversationResult);
    const result = await adapter.converse(undefined, 'system', [
      { role: 'user', content: 'use a tool' },
    ]);

    expect(result.stopReason).toBe('tool_use');
    expect(result.content[0]!.type).toBe('tool_use');
  });

  it('converse() extracts text from content blocks when delegating', async () => {
    const adapter = new MockLLMAdapter((_, prompt) => ({
      text: `echo: ${prompt}`,
      tokens: { input: 5, output: 5 },
    }));

    const result = await adapter.converse(undefined, 'system', [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first part' },
          { type: 'text', text: '\nsecond part' },
        ],
      },
    ]);

    expect(result.content).toHaveLength(1);
    if (result.content[0]!.type === 'text') {
      expect(result.content[0]!.text).toContain('first part');
    }
  });

  it('isStreamingAdapter() returns true for MockLLMAdapter', () => {
    const adapter = new MockLLMAdapter();
    expect(isStreamingAdapter(adapter)).toBe(true);
  });

  it('converseStream() synthesizes stream from converse() by default', async () => {
    const adapter = new MockLLMAdapter(() => ({
      text: 'streamed text',
      tokens: { input: 5, output: 3 },
    }));

    const streaming = adapter.converseStream(undefined, 'system', [
      { role: 'user', content: 'hi' },
    ]);

    const events = [];
    for await (const event of streaming.events) {
      events.push(event);
    }

    // Should have a text_delta and done event
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events[events.length - 1]!.type).toBe('done');

    const result = await streaming.result;
    expect(result.content[0]!.type).toBe('text');
  });

  it('converseStream() uses streamingHandler when provided', async () => {
    const adapter = new MockLLMAdapter(undefined, undefined, () => ({
      events: (async function* () {
        yield { type: 'text_delta' as const, delta: 'custom' };
        yield { type: 'done' as const };
      })(),
      result: Promise.resolve({
        content: [{ type: 'text' as const, text: 'custom' }],
        stopReason: 'end_turn' as const,
        tokens: { input: 1, output: 1 },
      }),
    }));

    const streaming = adapter.converseStream(undefined, 'sys', [
      { role: 'user', content: 'test' },
    ]);

    const events = [];
    for await (const event of streaming.events) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'text_delta', delta: 'custom' });
  });
});
