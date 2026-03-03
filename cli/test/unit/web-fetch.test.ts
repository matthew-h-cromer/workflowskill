import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webFetch } from '../../src/tools/web-fetch.js';

const HTML_PAGE = `<!DOCTYPE html>
<html>
  <head><title>Test Page</title></head>
  <body>
    <article>
      <h1>Hello World</h1>
      <p>This is the main content.</p>
    </article>
  </body>
</html>`;

function makeFetchResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('webFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns error when url is missing', async () => {
    const result = await webFetch({});
    expect(result.error).toMatch(/url/i);
    expect(result.output).toBeNull();
  });

  it('returns error on HTTP failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('Not Found', 'text/plain', 404));
    const result = await webFetch({ url: 'https://example.com' });
    expect(result.error).toMatch(/404/);
    expect(result.output).toBeNull();
  });

  it('returns error on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await webFetch({ url: 'https://example.com' });
    expect(result.error).toMatch(/network error/i);
    expect(result.output).toBeNull();
  });

  it('returns non-HTML content as-is', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('plain text', 'text/plain'));
    const result = await webFetch({ url: 'https://example.com/file.txt' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; url: string };
    expect(output.content).toBe('plain text');
    expect(output.url).toBe('https://example.com/file.txt');
  });

  it('parses HTML and returns markdown by default', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(HTML_PAGE, 'text/html'));
    const result = await webFetch({ url: 'https://example.com' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; title?: string; url: string };
    expect(output.content).toContain('Hello World');
    expect(output.url).toBe('https://example.com');
  });

  it('returns plain text when extract=text', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(HTML_PAGE, 'text/html'));
    const result = await webFetch({ url: 'https://example.com', extract: 'text' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string };
    // Should not contain markdown syntax
    expect(output.content).not.toMatch(/^#/m);
    expect(output.content).toContain('Hello World');
  });
});
