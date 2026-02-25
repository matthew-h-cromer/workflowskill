// Tool: http.request — make HTTP requests using Node built-in fetch.

import type { ToolDescriptor, ToolResult } from '../../types/index.js';

export interface HttpRequestArgs {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export const descriptor: ToolDescriptor = {
  name: 'http.request',
  description: 'Make an HTTP request and return the response status, headers, and body.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to request' },
      method: { type: 'string', description: 'HTTP method (default: GET)' },
      headers: { type: 'object', description: 'Request headers as key-value pairs' },
      body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
      timeout: { type: 'number', description: 'Request timeout in milliseconds (default: 30000)' },
    },
    required: ['url'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'number', description: 'HTTP status code' },
      headers: { type: 'object', description: 'Response headers' },
      body: {
        type: 'object',
        description:
          'Response body — parsed object when content-type is application/json, raw string otherwise',
      },
    },
  },
};

export async function handler(args: Record<string, unknown>): Promise<ToolResult> {
  const { url, method, headers, body: requestBody, timeout } = args as unknown as HttpRequestArgs;

  if (!url || typeof url !== 'string') {
    return { output: null, error: 'http.request: "url" is required and must be a string' };
  }

  try {
    const controller = new AbortController();
    const timeoutMs = timeout ?? 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: method ?? 'GET',
      headers: headers,
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const responseText = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Auto-parse JSON responses so workflows can access fields directly
    const contentType = response.headers.get('content-type') ?? '';
    let responseBody: unknown = responseText;
    if (contentType.includes('application/json')) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        // Keep raw text if JSON parsing fails
      }
    }

    return {
      output: {
        status: response.status,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: null, error: `http.request failed: ${message}` };
  }
}
