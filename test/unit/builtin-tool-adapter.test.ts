// Tests for src/adapters/builtin-tool-adapter.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the tool modules to avoid real dependencies
vi.mock('../../src/adapters/tools/http-request.js', () => ({
  descriptor: { name: 'http.request', description: 'HTTP requests' },
  handler: vi.fn().mockResolvedValue({ output: { status: 200 } }),
}));

vi.mock('../../src/adapters/tools/html-select.js', () => ({
  descriptor: { name: 'html.select', description: 'HTML selectors' },
  handler: vi.fn().mockResolvedValue({ output: { results: [] } }),
}));

vi.mock('../../src/adapters/tools/gmail.js', () => ({
  searchDescriptor: { name: 'gmail.search', description: 'Search Gmail' },
  readDescriptor: { name: 'gmail.read', description: 'Read Gmail' },
  sendDescriptor: { name: 'gmail.send', description: 'Send Gmail' },
  createHandlers: () => ({
    search: vi.fn().mockResolvedValue({ output: { messages: [] } }),
    read: vi.fn().mockResolvedValue({ output: {} }),
    send: vi.fn().mockResolvedValue({ output: { message_id: 'id' } }),
  }),
}));

vi.mock('../../src/adapters/tools/sheets.js', () => ({
  readDescriptor: { name: 'sheets.read', description: 'Read Sheets' },
  writeDescriptor: { name: 'sheets.write', description: 'Write Sheets' },
  appendDescriptor: { name: 'sheets.append', description: 'Append Sheets' },
  createHandlers: () => ({
    read: vi.fn().mockResolvedValue({ output: { values: [] } }),
    write: vi.fn().mockResolvedValue({ output: { updated_cells: 0 } }),
    append: vi.fn().mockResolvedValue({ output: { updated_range: '' } }),
  }),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    setCredentials() { /* noop */ }
  },
}));

import { BuiltinToolAdapter } from '../../src/adapters/builtin-tool-adapter.js';
import type { WorkflowSkillConfig } from '../../src/config/index.js';

describe('BuiltinToolAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always registers http.request and html.select', async () => {
    const adapter = await BuiltinToolAdapter.create({});

    expect(adapter.has('http.request')).toBe(true);
    expect(adapter.has('html.select')).toBe(true);
  });

  it('does not register Google tools without credentials', async () => {
    const adapter = await BuiltinToolAdapter.create({});

    expect(adapter.has('gmail.search')).toBe(false);
    expect(adapter.has('sheets.read')).toBe(false);
  });

  it('registers Google tools when credentials are provided', async () => {
    const config: WorkflowSkillConfig = {
      googleCredentials: {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      },
    };

    const adapter = await BuiltinToolAdapter.create(config);

    expect(adapter.has('gmail.search')).toBe(true);
    expect(adapter.has('gmail.read')).toBe(true);
    expect(adapter.has('gmail.send')).toBe(true);
    expect(adapter.has('sheets.read')).toBe(true);
    expect(adapter.has('sheets.write')).toBe(true);
    expect(adapter.has('sheets.append')).toBe(true);
  });

  it('list() returns descriptors for all registered tools', async () => {
    const config: WorkflowSkillConfig = {
      googleCredentials: {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      },
    };

    const adapter = await BuiltinToolAdapter.create(config);
    const descriptors = adapter.list();

    const names = descriptors.map((d) => d.name);
    expect(names).toContain('http.request');
    expect(names).toContain('html.select');
    expect(names).toContain('gmail.search');
    expect(names).toContain('sheets.read');
    expect(descriptors.length).toBe(8);
  });

  it('list() returns only http/html tools without Google creds', async () => {
    const adapter = await BuiltinToolAdapter.create({});
    const descriptors = adapter.list();
    expect(descriptors.length).toBe(2);
  });

  it('invoke() calls the correct handler', async () => {
    const adapter = await BuiltinToolAdapter.create({});
    const result = await adapter.invoke('http.request', { url: 'https://example.com' });
    expect(result.output).toEqual({ status: 200 });
  });

  it('invoke() returns error for unregistered tools', async () => {
    const adapter = await BuiltinToolAdapter.create({});
    const result = await adapter.invoke('nonexistent.tool', {});
    expect(result.error).toContain('not registered');
  });
});
