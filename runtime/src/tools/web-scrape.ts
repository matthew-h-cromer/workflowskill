// Tool: web.scrape — fetch a URL and extract data from the HTML response using CSS selectors.

import * as cheerio from 'cheerio';
import type { ToolDescriptor, ToolResult } from '../types/index.js';

export interface WebScrapeArgs {
  url: string;
  selector: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  attribute?: string;
  limit?: number;
  fields?: Record<string, string>;
}

export const descriptor: ToolDescriptor = {
  name: 'web.scrape',
  description:
    'Fetch a URL and extract data from the HTML response using CSS selectors. Returns text content, attribute values, or structured objects.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      selector: { type: 'string', description: 'CSS selector to match elements in the HTML response' },
      method: { type: 'string', description: 'HTTP method (default: GET)' },
      headers: { type: 'object', description: 'Request headers as key-value pairs' },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds (default: 30000)',
      },
      attribute: {
        type: 'string',
        description:
          'Attribute to extract instead of text content (ignored when fields is present)',
      },
      limit: { type: 'number', description: 'Maximum number of results to return' },
      fields: {
        type: 'object',
        description:
          'Map of field names to sub-selectors for structured extraction. Each value is a CSS selector scoped to the matched parent. Append " @attr" to extract an attribute (e.g. "a @href", "img @src"). Bare "@attr" extracts from the parent itself. When present, returns array of objects instead of strings.',
      },
    },
    required: ['url', 'selector'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Extracted values: strings without fields, objects with fields',
      },
    },
  },
};

/**
 * Parse a field spec string into a sub-selector and optional attribute name.
 * Formats: "h3.title" → text, "a.link @href" → attribute, "@data-id" → parent attribute.
 */
function parseFieldSpec(spec: string): { subSelector: string | null; attr: string | null } {
  const atIndex = spec.lastIndexOf(' @');
  if (atIndex >= 0) {
    // "sub-selector @attr"
    const subSelector = spec.slice(0, atIndex).trim() || null;
    const attr = spec.slice(atIndex + 2).trim();
    return { subSelector, attr: attr || null };
  }
  if (spec.startsWith('@')) {
    // Bare "@attr" — extract attribute from parent
    return { subSelector: null, attr: spec.slice(1) };
  }
  // Plain sub-selector — extract text
  return { subSelector: spec, attr: null };
}

export async function handler(args: Record<string, unknown>): Promise<ToolResult> {
  const { url, selector, method, headers, timeout, attribute, limit, fields } =
    args as unknown as WebScrapeArgs;

  if (!url || typeof url !== 'string') {
    return { output: null, error: 'web.scrape: "url" is required and must be a string' };
  }
  if (!selector || typeof selector !== 'string') {
    return { output: null, error: 'web.scrape: "selector" is required and must be a string' };
  }

  // Fetch the URL
  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutMs = typeof timeout === 'number' ? timeout : 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    response = await fetch(url, {
      method: method ?? 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: null, error: `web.scrape: fetch failed: ${message}` };
  }

  // Reject non-2xx responses
  if (!response.ok) {
    return { output: null, error: `web.scrape: HTTP ${response.status}` };
  }

  // Reject JSON responses — CSS selectors are meaningless on JSON data
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return {
      output: null,
      error: 'web.scrape: response is JSON — use a different tool for JSON APIs',
    };
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const elements = $(selector);

  if (fields && typeof fields === 'object') {
    // Structured extraction: return array of objects
    const parsedFields = Object.entries(fields).map(([name, spec]) => ({
      name,
      ...parseFieldSpec(spec),
    }));

    let results: Array<Record<string, string | null>> = [];
    elements.each((_i, el) => {
      const row: Record<string, string | null> = {};
      for (const { name, subSelector, attr } of parsedFields) {
        const target = subSelector ? $(el).find(subSelector).first() : $(el);
        if (target.length === 0) {
          row[name] = null;
        } else if (attr) {
          row[name] = target.attr(attr) ?? null;
        } else {
          row[name] = target.text().trim();
        }
      }
      results.push(row);
    });

    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit);
    }

    return { output: { results } };
  }

  // Simple extraction: return array of strings
  let results: string[] = [];
  elements.each((_i, el) => {
    if (attribute) {
      const val = $(el).attr(attribute);
      if (val !== undefined) {
        results.push(val);
      }
    } else {
      results.push($(el).text().trim());
    }
  });

  if (limit !== undefined && limit > 0) {
    results = results.slice(0, limit);
  }

  return { output: { results } };
}
