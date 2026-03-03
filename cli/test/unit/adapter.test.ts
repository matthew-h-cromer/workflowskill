import { describe, it, expect } from 'vitest';
import { CliToolAdapter } from '../../src/adapter.js';

describe('CliToolAdapter', () => {
  it('registers web_fetch and llm', () => {
    const adapter = new CliToolAdapter();
    expect(adapter.has('web_fetch')).toBe(true);
    expect(adapter.has('llm')).toBe(true);
    expect(adapter.has('unknown')).toBe(false);
  });

  it('list() returns descriptors for both tools', () => {
    const adapter = new CliToolAdapter();
    const names = adapter.list().map((t) => t.name);
    expect(names).toContain('web_fetch');
    expect(names).toContain('llm');
  });

  it('invoke returns error for unknown tool', async () => {
    const adapter = new CliToolAdapter();
    const result = await adapter.invoke('nope', {});
    expect(result.error).toMatch(/not registered/i);
    expect(result.output).toBeNull();
  });

  it('invoke wraps handler exceptions into ToolResult.error', async () => {
    const adapter = new CliToolAdapter();
    // web_fetch with an invalid URL that causes fetch to throw — but fetch is real here.
    // Instead test by invoking with missing required args (url is empty string).
    const result = await adapter.invoke('web_fetch', { url: '' });
    expect(result.error).toBeDefined();
    expect(result.output).toBeNull();
  });
});
