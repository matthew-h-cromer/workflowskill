import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webFetchRaw } from '../../src/tools/web-fetch-raw.js';

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

describe('webFetchRaw', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns error when url is missing', async () => {
    const result = await webFetchRaw({});
    expect(result.error).toMatch(/url/i);
    expect(result.output).toBeNull();
  });

  it('returns error on HTTP failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('Not Found', 'text/plain', 404));
    const result = await webFetchRaw({ url: 'https://example.com' });
    expect(result.error).toMatch(/404/);
    expect(result.output).toBeNull();
  });

  it('returns error on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await webFetchRaw({ url: 'https://example.com' });
    expect(result.error).toMatch(/network error/i);
    expect(result.output).toBeNull();
  });

  it('returns JSON response as raw string', async () => {
    const json = '{"key":"value","count":42}';
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(json, 'application/json'));
    const result = await webFetchRaw({ url: 'https://api.example.com/data' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; url: string; contentType: string; status: number };
    expect(output.content).toBe(json);
    expect(output.url).toBe('https://api.example.com/data');
    expect(output.contentType).toContain('application/json');
    expect(output.status).toBe(200);
  });

  it('returns HTML response as raw string without conversion', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(HTML_PAGE, 'text/html'));
    const result = await webFetchRaw({ url: 'https://example.com' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; url: string; contentType: string; status: number };
    expect(output.content).toBe(HTML_PAGE);
    expect(output.content).toContain('<html>');
    expect(output.url).toBe('https://example.com');
    expect(output.contentType).toContain('text/html');
    expect(output.status).toBe(200);
  });
});
