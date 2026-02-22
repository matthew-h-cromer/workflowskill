// Tool: html.select — extract data from HTML using CSS selectors.

import * as cheerio from 'cheerio';
import type { ToolDescriptor, ToolResult } from '../../types/index.js';

export interface HtmlSelectArgs {
  html: string;
  selector: string;
  attribute?: string;
  limit?: number;
}

export const descriptor: ToolDescriptor = {
  name: 'html.select',
  description: 'Extract data from HTML using a CSS selector. Returns text content or attribute values.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML content to search' },
      selector: { type: 'string', description: 'CSS selector to match elements' },
      attribute: { type: 'string', description: 'Attribute to extract (default: text content)' },
      limit: { type: 'number', description: 'Maximum number of results to return' },
    },
    required: ['html', 'selector'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extracted text or attribute values',
      },
    },
  },
};

export async function handler(args: Record<string, unknown>): Promise<ToolResult> {
  const { html, selector, attribute, limit } = args as unknown as HtmlSelectArgs;

  if (!html || typeof html !== 'string') {
    return { output: null, error: 'html.select: "html" is required and must be a string' };
  }
  if (!selector || typeof selector !== 'string') {
    return { output: null, error: 'html.select: "selector" is required and must be a string' };
  }

  const $ = cheerio.load(html);
  const elements = $(selector);

  let results: string[] = [];
  elements.each((_i, el) => {
    if (attribute) {
      const val = $(el).attr(attribute);
      if (val !== undefined) {
        results.push(val);
      }
    } else {
      results.push($(el).text());
    }
  });

  if (limit !== undefined && limit > 0) {
    results = results.slice(0, limit);
  }

  return { output: { results } };
}
