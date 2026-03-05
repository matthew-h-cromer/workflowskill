// web_scrape tool — fetches a URL and extracts structured text via CSS selectors.

import * as cheerio from 'cheerio';
import type { ToolResult } from 'workflowskill';

export interface WebScrapeInput {
  url: string;
  selectors: Record<string, string>;
  headers?: Record<string, string>;
}

export interface WebScrapeOutput {
  status: number;
  results: Record<string, string[]>;
}

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

export async function webScrape(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args['url'];
  const selectors = args['selectors'];
  const headers = args['headers'];

  if (typeof url !== 'string' || !url) {
    return { output: null, error: 'web_scrape: "url" is required and must be a string' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { output: null, error: `web_scrape: invalid URL: ${url}` };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { output: null, error: `web_scrape: URL must use http or https: ${url}` };
  }

  if (
    typeof selectors !== 'object' ||
    selectors === null ||
    Array.isArray(selectors)
  ) {
    return { output: null, error: 'web_scrape: "selectors" is required and must be an object' };
  }

  const selectorMap = selectors as Record<string, unknown>;
  for (const [key, val] of Object.entries(selectorMap)) {
    if (typeof val !== 'string') {
      return { output: null, error: `web_scrape: selector "${key}" must be a string` };
    }
  }

  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; WorkflowSkill/1.0)',
  };
  if (typeof headers === 'object' && headers !== null && !Array.isArray(headers)) {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof v === 'string') {
        fetchHeaders[k] = v;
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: fetchHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: null, error: `web_scrape: network error fetching ${url}: ${msg}` };
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    return { output: null, error: `web_scrape: response too large for ${url}` };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return { output: null, error: `web_scrape: response too large for ${url}` };
  }

  const html = new TextDecoder().decode(arrayBuffer);
  const $ = cheerio.load(html);

  const results: Record<string, string[]> = {};
  for (const [name, selector] of Object.entries(selectorMap as Record<string, string>)) {
    results[name] = $(selector)
      .map((_i, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0);
  }

  const output: WebScrapeOutput = { status: response.status, results };
  return { output };
}
