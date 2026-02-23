// Tool: html.select — extract data from HTML using CSS selectors.

import * as cheerio from 'cheerio';
import type { ToolDescriptor, ToolResult } from '../../types/index.js';

export interface HtmlSelectArgs {
  html: string;
  selector: string;
  attribute?: string;
  limit?: number;
  fields?: Record<string, string>;
}

export const descriptor: ToolDescriptor = {
  name: 'html.select',
  description:
    'Extract data from HTML using CSS selectors. Returns text content, attribute values, or structured objects.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML content to search' },
      selector: { type: 'string', description: 'CSS selector to match elements' },
      attribute: {
        type: 'string',
        description: 'Attribute to extract instead of text content (ignored when fields is present)',
      },
      limit: { type: 'number', description: 'Maximum number of results to return' },
      fields: {
        type: 'object',
        description:
          'Map of field names to sub-selectors for structured extraction. Each value is a CSS selector scoped to the matched parent. Append " @attr" to extract an attribute (e.g. "a @href", "img @src"). Bare "@attr" extracts from the parent itself. When present, returns array of objects instead of strings.',
      },
    },
    required: ['html', 'selector'],
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
  const { html, selector, attribute, limit, fields } = args as unknown as HtmlSelectArgs;

  if (!html || typeof html !== 'string') {
    return { output: null, error: 'html.select: "html" is required and must be a string' };
  }
  if (!selector || typeof selector !== 'string') {
    return { output: null, error: 'html.select: "selector" is required and must be a string' };
  }

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

  // Simple extraction: return array of strings (original behavior)
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
