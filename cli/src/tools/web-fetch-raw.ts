// web_fetch_raw tool — fetches a URL and returns the raw response body without any transformation.

import type { ToolResult } from 'workflowskill';

export interface WebFetchRawInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface WebFetchRawOutput {
  content: string;
  url: string;
  contentType: string;
  status: number;
}

const TIMEOUT_MS = 30_000;
const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export async function webFetchRaw(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args['url'];

  if (typeof url !== 'string' || !url) {
    return { output: null, error: 'web_fetch_raw: "url" is required and must be a string' };
  }

  const rawMethod = args['method'];
  const method = rawMethod === undefined ? 'GET' : rawMethod;

  if (typeof method !== 'string' || !(VALID_METHODS as readonly string[]).includes(method.toUpperCase())) {
    return {
      output: null,
      error: `web_fetch_raw: "method" must be one of ${VALID_METHODS.join(', ')}`,
    };
  }
  const normalizedMethod = method.toUpperCase();

  const rawHeaders = args['headers'];
  const fetchHeaders: Record<string, string> = {};
  if (rawHeaders !== undefined) {
    if (typeof rawHeaders !== 'object' || rawHeaders === null || Array.isArray(rawHeaders)) {
      return { output: null, error: 'web_fetch_raw: "headers" must be an object' };
    }
    for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
      if (typeof v === 'string') {
        fetchHeaders[k] = v;
      }
    }
  }

  const body = args['body'];
  if (body !== undefined) {
    if (normalizedMethod === 'GET') {
      return { output: null, error: 'web_fetch_raw: "body" is not allowed with GET requests' };
    }
    if (typeof body !== 'string') {
      return { output: null, error: 'web_fetch_raw: "body" must be a string' };
    }
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      response = await fetch(url, {
        method: normalizedMethod,
        headers: Object.keys(fetchHeaders).length > 0 ? fetchHeaders : undefined,
        body: typeof body === 'string' ? body : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: null, error: `web_fetch_raw: network error fetching ${url}: ${msg}` };
  }

  const contentType = response.headers.get('content-type') ?? '';
  const content = await response.text();

  const output: WebFetchRawOutput = {
    content,
    url,
    contentType,
    status: response.status,
  };
  return { output };
}
