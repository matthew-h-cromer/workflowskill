// Mock tool adapter for testing.
// Allows registering per-tool handlers that return configurable results.

import type { ToolAdapter, ToolDescriptor, ToolResult } from '../types/index.js';

/** Handler function for a registered mock tool. */
export type ToolHandler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

export class MockToolAdapter implements ToolAdapter {
  private tools = new Map<
    string,
    { handler: ToolHandler; descriptor: ToolDescriptor }
  >();

  /** Register a tool handler with optional descriptor metadata. */
  register(
    toolName: string,
    handler: ToolHandler,
    descriptor?: Omit<ToolDescriptor, 'name'>,
  ): void {
    this.tools.set(toolName, {
      handler,
      descriptor: {
        name: toolName,
        description: descriptor?.description ?? '',
        ...(descriptor?.inputSchema && { inputSchema: descriptor.inputSchema }),
        ...(descriptor?.outputSchema && { outputSchema: descriptor.outputSchema }),
      },
    });
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /** List all registered tools with their descriptors. */
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
}
