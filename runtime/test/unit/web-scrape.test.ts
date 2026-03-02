// Tests for src/tools/web-scrape.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler, descriptor } from '../../src/tools/web-scrape.js';

const sampleHtml = `
<html>
<body>
  <h1>Title</h1>
  <ul>
    <li class="item"><a href="/a">Alpha</a></li>
    <li class="item"><a href="/b">Beta</a></li>
    <li class="item"><a href="/c">Gamma</a></li>
  </ul>
  <p id="desc">A description</p>
</body>
</html>
`;

const cardHtml = `
<html><body>
  <div class="card" data-id="1">
    <h3 class="title">Alpha</h3>
    <a class="link" href="/alpha">View</a>
    <span class="tag">new</span>
  </div>
  <div class="card" data-id="2">
    <h3 class="title">  Beta  </h3>
    <a class="link" href="/beta">View</a>
  </div>
  <div class="card" data-id="3">
    <h3 class="title">Gamma</h3>
    <a class="link" href="/gamma">View</a>
    <span class="tag">featured</span>
  </div>
</body></html>`;

function makeHtmlResponse(html: string, contentType = 'text/html'): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    text: vi.fn().mockResolvedValue(html),
  } as unknown as Response;
}

describe('web.scrape tool', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('descriptor', () => {
    it('has the correct name', () => {
      expect(descriptor.name).toBe('web.scrape');
    });

    it('requires url and selector', () => {
      expect(descriptor.inputSchema?.required).toEqual(['url', 'selector']);
    });
  });

  describe('validation', () => {
    it('returns error when url is missing', async () => {
      const result = await handler({ selector: 'li' });
      expect(result.error).toContain('"url" is required');
      expect(result.output).toBeNull();
    });

    it('returns error when selector is missing', async () => {
      const result = await handler({ url: 'https://example.com' });
      expect(result.error).toContain('"selector" is required');
      expect(result.output).toBeNull();
    });
  });

  describe('simple text extraction', () => {
    it('extracts text from matching elements', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(sampleHtml));
      const result = await handler({ url: 'https://example.com', selector: 'li.item a' });
      expect(result.output).toEqual({ results: ['Alpha', 'Beta', 'Gamma'] });
    });

    it('extracts single element text', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(sampleHtml));
      const result = await handler({ url: 'https://example.com', selector: 'h1' });
      expect(result.output).toEqual({ results: ['Title'] });
    });

    it('returns empty results for non-matching selector', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(sampleHtml));
      const result = await handler({ url: 'https://example.com', selector: '.nonexistent' });
      expect(result.output).toEqual({ results: [] });
    });
  });

  describe('attribute extraction', () => {
    it('extracts attribute values when attribute is specified', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(sampleHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'li.item a',
        attribute: 'href',
      });
      expect(result.output).toEqual({ results: ['/a', '/b', '/c'] });
    });
  });

  describe('limit', () => {
    it('respects the limit parameter', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(sampleHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'li.item a',
        limit: 2,
      });
      expect(result.output).toEqual({ results: ['Alpha', 'Beta'] });
    });

    it('respects limit with fields mode', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title' },
        limit: 2,
      });
      expect(result.output).toEqual({ results: [{ title: 'Alpha' }, { title: 'Beta' }] });
    });
  });

  describe('fields extraction', () => {
    it('extracts multiple fields per matched parent', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title', link: 'a.link' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', link: 'View' },
          { title: 'Beta', link: 'View' },
          { title: 'Gamma', link: 'View' },
        ],
      });
    });

    it('extracts attributes via @attr suffix in field spec', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title', url: 'a.link @href' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', url: '/alpha' },
          { title: 'Beta', url: '/beta' },
          { title: 'Gamma', url: '/gamma' },
        ],
      });
    });

    it('extracts parent attribute via bare @attr in field spec', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { id: '@data-id', title: 'h3.title' },
      });
      expect(result.output).toEqual({
        results: [
          { id: '1', title: 'Alpha' },
          { id: '2', title: 'Beta' },
          { id: '3', title: 'Gamma' },
        ],
      });
    });

    it('returns null for missing sub-elements', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title', tag: 'span.tag' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', tag: 'new' },
          { title: 'Beta', tag: null },
          { title: 'Gamma', tag: 'featured' },
        ],
      });
    });

    it('trims text content in fields mode', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title' },
        limit: 2,
      });
      const results = (result.output as { results: Array<Record<string, string | null>> }).results;
      // Second card has "  Beta  " in source — should be trimmed
      expect(results[1]!.title).toBe('Beta');
    });
  });

  describe('error handling', () => {
    it('returns error on fetch/network failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('fetch failed'));
      const result = await handler({ url: 'https://example.com', selector: 'li' });
      expect(result.error).toContain('fetch failed');
      expect(result.output).toBeNull();
    });

    it('returns error on non-2xx status', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('Not Found'),
      } as unknown as Response);
      const result = await handler({ url: 'https://example.com', selector: 'li' });
      expect(result.error).toContain('HTTP 404');
      expect(result.output).toBeNull();
    });

    it('returns error when response is JSON', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        makeHtmlResponse('{"items":[]}', 'application/json'),
      );
      const result = await handler({ url: 'https://api.example.com/items', selector: 'li' });
      expect(result.error).toContain('JSON');
      expect(result.output).toBeNull();
    });
  });

  describe('parseFieldSpec formats', () => {
    it('handles plain sub-selector (text extraction)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { title: 'h3.title' },
        limit: 1,
      });
      expect((result.output as { results: unknown[] }).results[0]).toEqual({ title: 'Alpha' });
    });

    it('handles "selector @attr" format', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { link: 'a.link @href' },
        limit: 1,
      });
      expect((result.output as { results: unknown[] }).results[0]).toEqual({ link: '/alpha' });
    });

    it('handles bare "@attr" format for parent attribute', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(makeHtmlResponse(cardHtml));
      const result = await handler({
        url: 'https://example.com',
        selector: 'div.card',
        fields: { id: '@data-id' },
        limit: 1,
      });
      expect((result.output as { results: unknown[] }).results[0]).toEqual({ id: '1' });
    });
  });
});
