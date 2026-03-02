// Builtin tool adapter — registers tool implementations that ship with the package.

import type { ToolAdapter, ToolDescriptor, ToolResult } from '../types/index.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export class BuiltinToolAdapter implements ToolAdapter {
  private tools = new Map<
    string,
    { handler: ToolHandler; descriptor: ToolDescriptor }
  >();

  private register(
    descriptor: ToolDescriptor,
    handler: ToolHandler,
  ): void {
    this.tools.set(descriptor.name, { handler, descriptor });
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
    return entry.handler(args);
  }

  /**
   * Create a BuiltinToolAdapter with all bundled tools registered.
   */
  static async create(): Promise<BuiltinToolAdapter> {
    const adapter = new BuiltinToolAdapter();

    const scrapeMod = await import('./web-scrape.js');
    adapter.register(scrapeMod.descriptor, scrapeMod.handler);

    return adapter;
  }
}
