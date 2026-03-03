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

    // tool_b has inputSchema stored
    const b = descriptors.find((d) => d.name === 'tool_b')!;
    expect(b.description).toBe('Tool B');
    expect(b.inputSchema).toEqual({ type: 'object' });
  });

  it('has() returns true for registered and false for unregistered', () => {
    const adapter = new MockToolAdapter();
    adapter.register('exists', () => ({ output: true }));

    expect(adapter.has('exists')).toBe(true);
    expect(adapter.has('missing')).toBe(false);
  });

  it('invoke() calls registered handler and returns result', async () => {
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
