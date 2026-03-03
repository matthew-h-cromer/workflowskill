// web_fetch tool — fetches a URL and returns readable content.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import type { ToolResult } from 'workflowskill';

export interface WebFetchInput {
  url: string;
  extract?: 'text' | 'markdown';
}

export interface WebFetchOutput {
  content: string;
  title?: string;
  url: string;
}

const TIMEOUT_MS = 30_000;

export async function webFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args['url'];
  const extract = (args['extract'] as string | undefined) ?? 'markdown';

  if (typeof url !== 'string' || !url) {
    return { output: null, error: 'web_fetch: "url" is required and must be a string' };
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
    return { output: null, error: `web_fetch: network error fetching ${url}: ${msg}` };
  }

  if (!response.ok) {
    return {
      output: null,
      error: `web_fetch: HTTP ${response.status} ${response.statusText} for ${url}`,
    };
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (!contentType.includes('text/html')) {
    const output: WebFetchOutput = { content: body, url };
    return { output };
  }

  // Parse HTML and extract readable content
  const { document } = parseHTML(body);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article) {
    // Fall back to raw body if Readability can't parse
    const output: WebFetchOutput = { content: body, url };
    return { output };
  }

  let content: string;
  if (extract === 'text') {
    content = (article.textContent ?? '').replace(/\s+/g, ' ').trim();
  } else {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    content = td.turndown(article.content ?? '');
  }

  const output: WebFetchOutput = {
    content,
    title: article.title || undefined,
    url,
  };
  return { output };
}
