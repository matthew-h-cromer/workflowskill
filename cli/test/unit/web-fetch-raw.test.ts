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

  it('4xx response returns output with status, not error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('{"error":"not found"}', 'application/json', 404));
    const result = await webFetchRaw({ url: 'https://api.example.com/missing' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; status: number };
    expect(output.status).toBe(404);
    expect(output.content).toBe('{"error":"not found"}');
  });

  it('5xx response returns output with status, not error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('Internal Server Error', 'text/plain', 500));
    const result = await webFetchRaw({ url: 'https://api.example.com/broken' });
    expect(result.error).toBeUndefined();
    const output = result.output as { content: string; status: number };
    expect(output.status).toBe(500);
    expect(output.content).toBe('Internal Server Error');
  });

  it('defaults to GET when method is omitted', async () => {
    const json = '{"ok":true}';
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(json, 'application/json'));
    await webFetchRaw({ url: 'https://api.example.com/data' });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POST request passes method and body to fetch', async () => {
    const responseJson = '{"id":1}';
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(responseJson, 'application/json', 201));
    const result = await webFetchRaw({
      url: 'https://api.example.com/items',
      method: 'POST',
      body: '{"name":"test"}',
    });
    expect(result.error).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({ method: 'POST', body: '{"name":"test"}' }),
    );
    const output = result.output as { status: number };
    expect(output.status).toBe(201);
  });

  it('custom headers are forwarded to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse('ok', 'text/plain'));
    await webFetchRaw({
      url: 'https://api.example.com/data',
      headers: { Authorization: 'Bearer token123', 'X-Custom': 'value' },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token123', 'X-Custom': 'value' },
      }),
    );
  });

  it('invalid method returns error', async () => {
    const result = await webFetchRaw({ url: 'https://example.com', method: 'INVALID' });
    expect(result.error).toMatch(/method/i);
    expect(result.output).toBeNull();
  });

  it('body with GET returns error', async () => {
    const result = await webFetchRaw({
      url: 'https://example.com',
      method: 'GET',
      body: 'some body',
    });
    expect(result.error).toMatch(/body.*GET|GET.*body/i);
    expect(result.output).toBeNull();
  });
});
