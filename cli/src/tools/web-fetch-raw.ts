// web_fetch_raw tool — fetches a URL and returns the raw response body without any transformation.

import type { ToolResult } from 'workflowskill';

export interface WebFetchRawInput {
  url: string;
}

export interface WebFetchRawOutput {
  content: string;
  url: string;
  contentType: string;
  status: number;
}

const TIMEOUT_MS = 30_000;

export async function webFetchRaw(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args['url'];

  if (typeof url !== 'string' || !url) {
    return { output: null, error: 'web_fetch_raw: "url" is required and must be a string' };
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: null, error: `web_fetch_raw: network error fetching ${url}: ${msg}` };
  }

  if (!response.ok) {
    return {
      output: null,
      error: `web_fetch_raw: HTTP ${response.status} ${response.statusText} for ${url}`,
    };
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
