import { describe, it, expect, vi } from 'vitest';
import {
  BridgeToolAdapter,
  BridgeLLMAdapter,
  createBridgeAdapters,
} from '../../openclaw/lib/adapters.js';
import type { BridgeApi } from '../../openclaw/lib/adapters.js';

// ─── BridgeApi mock factory ────────────────────────────────────────────────

function makeBridgeApi(overrides: Partial<BridgeApi> = {}): BridgeApi {
  return {
    invokeTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{}' }] }),
    hasTool: vi.fn().mockReturnValue(false),
    listTools: undefined,
    completion: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] }),
    ...overrides,
  };
}

// ─── BridgeToolAdapter ─────────────────────────────────────────────────────

describe('BridgeToolAdapter', () => {
  it('has() delegates to api.hasTool()', () => {
    const api = makeBridgeApi({ hasTool: vi.fn().mockReturnValue(true) });
    const adapter = new BridgeToolAdapter(api);
    expect(adapter.has('http.request')).toBe(true);
    expect(api.hasTool).toHaveBeenCalledWith('http.request');
  });

  it('has() returns false when api.hasTool() returns false', () => {
    const api = makeBridgeApi({ hasTool: vi.fn().mockReturnValue(false) });
    const adapter = new BridgeToolAdapter(api);
    expect(adapter.has('unknown.tool')).toBe(false);
  });

  it('invoke() parses JSON content block into ToolResult', async () => {
    const payload = { items: [1, 2, 3] };
    const api = makeBridgeApi({
      invokeTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      }),
    });
    const adapter = new BridgeToolAdapter(api);
    const result = await adapter.invoke('some.tool', { arg: 'val' });
    expect(result).toEqual({ output: payload });
    expect(api.invokeTool).toHaveBeenCalledWith('some.tool', { arg: 'val' });
  });

  it('invoke() falls back to raw text when JSON.parse fails', async () => {
    const api = makeBridgeApi({
      invokeTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'plain text result' }],
      }),
    });
    const adapter = new BridgeToolAdapter(api);
    const result = await adapter.invoke('some.tool', {});
    expect(result).toEqual({ output: 'plain text result' });
  });

  it('invoke() returns { output: null, error } when bridge throws', async () => {
    const api = makeBridgeApi({
      invokeTool: vi.fn().mockRejectedValue(new Error('network failure')),
    });
    const adapter = new BridgeToolAdapter(api);
    const result = await adapter.invoke('some.tool', {});
    expect(result.output).toBeNull();
    expect(result.error).toBe('network failure');
  });

  it('list() returns [] when listTools is not available', () => {
    const api = makeBridgeApi({ listTools: undefined });
    const adapter = new BridgeToolAdapter(api);
    expect(adapter.list()).toEqual([]);
  });

  it('list() maps api.listTools() to ToolDescriptor[]', () => {
    const api = makeBridgeApi({
      listTools: () => [
        { name: 'http.request', description: 'Make HTTP requests' },
        { name: 'html.select', description: 'Select HTML elements' },
      ],
    });
    const adapter = new BridgeToolAdapter(api);
    expect(adapter.list()).toEqual([
      { name: 'http.request', description: 'Make HTTP requests' },
      { name: 'html.select', description: 'Select HTML elements' },
    ]);
  });
});

// ─── BridgeLLMAdapter ─────────────────────────────────────────────────────

describe('BridgeLLMAdapter', () => {
  it('call() extracts text from content blocks and reports zero tokens', async () => {
    const api = makeBridgeApi({
      completion: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'hello world' }],
      }),
    });
    const adapter = new BridgeLLMAdapter(api);
    const result = await adapter.call(undefined, 'test prompt');
    expect(result.text).toBe('hello world');
    expect(result.tokens).toEqual({ input: 0, output: 0 });
  });

  it('call() concatenates multiple text blocks', async () => {
    const api = makeBridgeApi({
      completion: vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'text', text: 'part two' },
        ],
      }),
    });
    const adapter = new BridgeLLMAdapter(api);
    const result = await adapter.call(undefined, 'prompt');
    expect(result.text).toBe('part one part two');
  });

  it('call() passes model through to api.completion()', async () => {
    const completion = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const api = makeBridgeApi({ completion });
    const adapter = new BridgeLLMAdapter(api);
    await adapter.call('claude-haiku-4-5-20251001', 'hi');
    expect(completion).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5-20251001',
      prompt: 'hi',
    });
  });

  it('call() passes undefined model when not specified', async () => {
    const completion = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const api = makeBridgeApi({ completion });
    const adapter = new BridgeLLMAdapter(api);
    await adapter.call(undefined, 'prompt');
    expect(completion).toHaveBeenCalledWith({ model: undefined, prompt: 'prompt' });
  });
});

// ─── createBridgeAdapters ─────────────────────────────────────────────────

describe('createBridgeAdapters', () => {
  it('returns both toolAdapter and llmAdapter', () => {
    const api = makeBridgeApi();
    const { toolAdapter, llmAdapter } = createBridgeAdapters(api);
    expect(toolAdapter).toBeInstanceOf(BridgeToolAdapter);
    expect(llmAdapter).toBeInstanceOf(BridgeLLMAdapter);
  });
});
