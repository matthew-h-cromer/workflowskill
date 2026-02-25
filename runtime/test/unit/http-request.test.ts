// Tests for src/adapters/tools/http-request.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler, descriptor } from '../../src/adapters/tools/http-request.js';

describe('http.request tool', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('descriptor', () => {
    it('has the correct name', () => {
      expect(descriptor.name).toBe('http.request');
    });

    it('requires url parameter', () => {
      expect(descriptor.inputSchema?.required).toContain('url');
    });
  });

  describe('handler', () => {
    it('returns error when url is missing', async () => {
      const result = await handler({});
      expect(result.error).toContain('"url" is required');
      expect(result.output).toBeNull();
    });

    it('makes a GET request by default', async () => {
      const mockHeaders = new Headers({ 'content-type': 'text/html' });
      const mockResponse = {
        status: 200,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('<html>hello</html>'),
      };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

      const result = await handler({ url: 'https://example.com' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.output).toEqual({
        status: 200,
        headers: expect.objectContaining({ 'content-type': 'text/html' }),
        body: '<html>hello</html>',
      });
    });

    it('passes custom method and headers', async () => {
      const mockHeaders = new Headers();
      const mockResponse = {
        status: 201,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"id":1}'),
      };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

      await handler({
        url: 'https://api.example.com/items',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"test"}',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"name":"test"}',
        }),
      );
    });

    it('auto-parses JSON responses when content-type is application/json', async () => {
      const mockHeaders = new Headers({ 'content-type': 'application/json; charset=utf-8' });
      const mockResponse = {
        status: 200,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"userId":1,"id":1,"title":"delectus aut autem","completed":false}'),
      };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

      const result = await handler({ url: 'https://api.example.com/todos/1' });

      const output = result.output as { status: number; headers: Record<string, string>; body: unknown };
      expect(output.body).toEqual({
        userId: 1,
        id: 1,
        title: 'delectus aut autem',
        completed: false,
      });
    });

    it('falls back to raw text when JSON parsing fails', async () => {
      const mockHeaders = new Headers({ 'content-type': 'application/json' });
      const mockResponse = {
        status: 200,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('not valid json{'),
      };
      vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

      const result = await handler({ url: 'https://api.example.com/broken' });

      const output = result.output as { status: number; headers: Record<string, string>; body: unknown };
      expect(output.body).toBe('not valid json{');
    });

    it('handles fetch errors gracefully', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

      const result = await handler({ url: 'https://fail.example.com' });
      expect(result.error).toContain('http.request failed');
      expect(result.error).toContain('Network error');
      expect(result.output).toBeNull();
    });
  });
});
