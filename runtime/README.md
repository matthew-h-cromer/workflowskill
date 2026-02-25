# WorkflowSkill Runtime

Reference TypeScript implementation of the [WorkflowSkill](../) specification.

## Quick start

**Prerequisites:** Node.js >= 20

```bash
npm install
npm run build
```

Validate and run a workflow:

```bash
npx tsx src/cli/index.ts validate test/fixtures/echo.md
npx tsx src/cli/index.ts run test/fixtures/echo.md -i '{"message": "hi"}'
```

## CLI

```bash
workflowskill validate <files...>              # Validate workflow files
workflowskill run <file> [-i <json>]           # Execute a workflow
workflowskill generate "<prompt>" [-o <file>]  # Generate from natural language
```

Dev mode: `npx tsx src/cli/index.ts <command>`

## Library API

```typescript
import {
  parseWorkflowFromMd,
  validateWorkflow,
  runWorkflow,
  generateWorkflow,
  MockToolAdapter,
  MockLLMAdapter,
} from "workflowskill";

const workflow = parseWorkflowFromMd(markdownContent);
const validation = validateWorkflow(workflow, toolAdapter);

const runLog = await runWorkflow({
  workflow,
  inputs: { message: "hello" },
  toolAdapter, // implements ToolAdapter
  llmAdapter,  // implements LLMAdapter
});

const generated = await generateWorkflow({
  prompt: "Triage my daily emails",
  llmAdapter,
  toolDescriptors: [
    {
      name: "gmail.search",
      description: "Search Gmail messages by query.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          max_results: { type: "integer", description: "Maximum results" },
        },
        required: ["query"],
      },
    },
  ],
});
```

### Adapters

`ToolAdapter` and `LLMAdapter` are the integration boundaries. Mock implementations are provided for testing.

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];
}

interface LLMAdapter {
  call(
    model: string | undefined,
    prompt: string,
    responseFormat?: Record<string, unknown>,
  ): Promise<LLMResult>;
}
```

## Development

```bash
npm run typecheck          # tsc --noEmit
npm run test               # Run all tests (vitest)
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # tsdown
npm run validate:examples  # Validate all fixtures
```

## Built-in tools

| Tool | Description | Requires config |
|------|-------------|-----------------|
| `http.request` | HTTP request — returns status, headers, body | No |
| `html.select` | Extract data from HTML using CSS selectors | No |
| `gmail.search` | Search Gmail messages by query | Google OAuth2 |
| `gmail.read` | Read a full Gmail message by ID | Google OAuth2 |
| `gmail.send` | Send an email via Gmail | Google OAuth2 |
| `sheets.read` | Read values from a Google Sheets range | Google OAuth2 |
| `sheets.write` | Write values to a Google Sheets range | Google OAuth2 |
| `sheets.append` | Append rows to a Google Sheets range | Google OAuth2 |

`http.request` and `html.select` work out of the box with no configuration.

## Configuration

Create a `.env` file in this directory:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for LLM steps and workflow generation
GOOGLE_CLIENT_ID=...               # Required for Gmail and Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

The runtime degrades gracefully: missing `ANTHROPIC_API_KEY` → mock LLM adapter with a warning. Missing Google credentials → Google tools not registered (warning if a workflow references them).

## License

MIT
