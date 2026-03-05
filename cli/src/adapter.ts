// CliToolAdapter — registers web_fetch and llm tools.

import type { ToolAdapter, ToolDescriptor, ToolResult } from 'workflowskill';
import { webFetch } from './tools/web-fetch.js';
import { webFetchRaw } from './tools/web-fetch-raw.js';
import { llm } from './tools/llm.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface ToolEntry {
  handler: ToolHandler;
  descriptor: ToolDescriptor;
}

export class CliToolAdapter implements ToolAdapter {
  private tools = new Map<string, ToolEntry>();

  constructor() {
    this.register('web_fetch', webFetch, {
      description: 'Fetch a URL and return its readable content as markdown or plain text.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          extract: {
            type: 'string',
            enum: ['markdown', 'text'],
            description: 'Output format (default: markdown)',
          },
        },
        required: ['url'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['content', 'url'],
      },
    });

    this.register('web_fetch_raw', webFetchRaw, {
      description:
        'Fetch a URL and return the raw response body (no HTML-to-markdown conversion). Use for API endpoints.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          url: { type: 'string' },
          contentType: { type: 'string' },
          status: { type: 'number' },
        },
        required: ['content', 'url', 'contentType', 'status'],
      },
    });

    this.register('llm', llm, {
      description: 'Call Claude and return a parsed JSON object.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'User prompt' },
          system: { type: 'string', description: 'Optional system prompt' },
          schema: { type: 'object', description: 'Optional JSON schema for the response shape' },
          model: { type: 'string', description: 'Model ID (default: claude-sonnet-4-20250514)' },
        },
        required: ['prompt'],
      },
    });
  }

  private register(
    toolName: string,
    handler: ToolHandler,
    descriptor: Omit<ToolDescriptor, 'name'>,
  ): void {
    this.tools.set(toolName, {
      handler,
      descriptor: { name: toolName, ...descriptor },
    });
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map((t) => t.descriptor);
  }

  async invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const entry = this.tools.get(toolName);
    if (!entry) {
      return { output: null, error: `Tool "${toolName}" not registered` };
    }
    try {
      return await entry.handler(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: null, error: `Tool "${toolName}" threw: ${msg}` };
    }
  }
}
