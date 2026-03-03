import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llm, setClient } from '../../src/tools/llm.js';
import type Anthropic from '@anthropic-ai/sdk';

function makeClient(text: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
      }),
    },
  } as unknown as Anthropic;
}

describe('llm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when prompt is missing', async () => {
    const result = await llm({});
    expect(result.error).toMatch(/prompt/i);
    expect(result.output).toBeNull();
  });

  it('parses a valid JSON response', async () => {
    setClient(makeClient('{"answer": 42}'));
    const result = await llm({ prompt: 'What is 6*7?' });
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ answer: 42 });
  });

  it('strips markdown code fences before parsing', async () => {
    setClient(makeClient('```json\n{"answer": 42}\n```'));
    const result = await llm({ prompt: 'What is 6*7?' });
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ answer: 42 });
  });

  it('returns error when JSON parse fails', async () => {
    setClient(makeClient('not json at all'));
    const result = await llm({ prompt: 'What is 6*7?' });
    expect(result.error).toMatch(/failed to parse JSON/i);
    expect(result.output).toBeNull();
  });

  it('returns error on API failure', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('rate limited')),
      },
    } as unknown as Anthropic;
    setClient(client);
    const result = await llm({ prompt: 'What is 6*7?' });
    expect(result.error).toMatch(/Anthropic API error/i);
    expect(result.output).toBeNull();
  });

  it('uses custom model when provided', async () => {
    const client = makeClient('{"x": 1}');
    setClient(client);
    await llm({ prompt: 'test', model: 'claude-opus-4-20250514' });
    const createFn = (client.messages.create as ReturnType<typeof vi.fn>);
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-20250514' }),
    );
  });
});
