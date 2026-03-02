// Tests for src/tools/builtin-tool-adapter.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the tool module to avoid real dependencies
vi.mock('../../src/tools/web-scrape.js', () => ({
  descriptor: { name: 'web.scrape', description: 'Web scraping tool' },
  handler: vi.fn().mockResolvedValue({ output: { results: ['scraped'] } }),
}));

import { BuiltinToolAdapter } from '../../src/tools/builtin-tool-adapter.js';

describe('BuiltinToolAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers web.scrape', async () => {
    const adapter = await BuiltinToolAdapter.create();
    expect(adapter.has('web.scrape')).toBe(true);
  });

  it('list() returns 1 descriptor', async () => {
    const adapter = await BuiltinToolAdapter.create();
    expect(adapter.list().length).toBe(1);
  });

  it('invoke() calls the web.scrape handler', async () => {
    const adapter = await BuiltinToolAdapter.create();
    const result = await adapter.invoke('web.scrape', {
      url: 'https://example.com',
      selector: 'li',
    });
    expect(result.output).toEqual({ results: ['scraped'] });
  });

  it('invoke() returns error for unregistered tools', async () => {
    const adapter = await BuiltinToolAdapter.create();
    const result = await adapter.invoke('nonexistent.tool', {});
    expect(result.error).toContain('not registered');
  });
});
