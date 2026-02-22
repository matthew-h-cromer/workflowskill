import { describe, it, expect } from 'vitest';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';

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
