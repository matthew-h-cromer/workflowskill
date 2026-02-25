// Built-in tool adapter — registers real tool implementations.
// Lazy-loads Google modules only when credentials are present.

import type { ToolAdapter, ToolDescriptor, ToolResult } from '../types/index.js';
import type { WorkflowSkillConfig } from '../config/index.js';

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
   * Create a BuiltinToolAdapter with all available tools registered.
   * Google tools are only registered if credentials are provided.
   */
  static async create(config: WorkflowSkillConfig): Promise<BuiltinToolAdapter> {
    const adapter = new BuiltinToolAdapter();

    // Always-available tools (no external deps beyond what's in package.json)
    const httpMod = await import('./tools/http-request.js');
    adapter.register(httpMod.descriptor, httpMod.handler);

    const htmlMod = await import('./tools/html-select.js');
    adapter.register(htmlMod.descriptor, htmlMod.handler);

    // Google tools — only if credentials are configured
    if (config.googleCredentials) {
      const { OAuth2Client } = await import('google-auth-library');
      const auth = new OAuth2Client(
        config.googleCredentials.clientId,
        config.googleCredentials.clientSecret,
      );
      auth.setCredentials({ refresh_token: config.googleCredentials.refreshToken });

      // Gmail
      const gmailMod = await import('./tools/gmail.js');
      const gmailHandlers = gmailMod.createHandlers(auth);
      adapter.register(gmailMod.searchDescriptor, gmailHandlers.search);
      adapter.register(gmailMod.readDescriptor, gmailHandlers.read);
      adapter.register(gmailMod.sendDescriptor, gmailHandlers.send);

      // Sheets
      const sheetsMod = await import('./tools/sheets.js');
      const sheetsHandlers = sheetsMod.createHandlers(auth);
      adapter.register(sheetsMod.readDescriptor, sheetsHandlers.read);
      adapter.register(sheetsMod.writeDescriptor, sheetsHandlers.write);
      adapter.register(sheetsMod.appendDescriptor, sheetsHandlers.append);
    }

    return adapter;
  }
}
