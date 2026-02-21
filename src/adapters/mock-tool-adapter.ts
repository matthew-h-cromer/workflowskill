// Mock tool adapter for testing.
// Allows registering per-tool handlers that return configurable results.

import type { ToolAdapter, ToolResult } from '../types/index.js';

export class MockToolAdapter implements ToolAdapter {
  private handlers = new Map<
    string,
    (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>
  >();

  /** Register a tool handler. */
  register(
    toolName: string,
    handler: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>,
  ): void {
    this.handlers.set(toolName, handler);
  }

  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  async invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      return { output: null, error: `Tool "${toolName}" not registered` };
    }
    return handler(args);
  }
}
