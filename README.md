# WorkflowSkill

A TypeScript runtime that parses, validates, and executes declarative agent workflows defined in YAML. LLM calls only where needed — everything else runs deterministically.

## Quick Start

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
} from 'workflowskill';

const workflow = parseWorkflowFromMd(markdownContent);
const validation = validateWorkflow(workflow, toolAdapter);

const runLog = await runWorkflow({
  workflow,
  inputs: { message: 'hello' },
  toolAdapter,  // implements ToolAdapter
  llmAdapter,   // implements LLMAdapter
});

const generated = await generateWorkflow({
  prompt: 'Triage my daily emails',
  llmAdapter,
  toolDescriptors: [
    {
      name: 'gmail.search',
      description: 'Search Gmail messages by query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'integer', description: 'Maximum results' },
        },
        required: ['query'],
      },
    },
    { name: 'slack.post_message', description: 'Post a message to Slack.' },
  ],
});
```

### Adapters

`ToolAdapter` and `LLMAdapter` are the integration boundaries. Mock implementations are provided for testing.

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];  // optional — for tool discovery
}

interface LLMAdapter {
  call(model: string | undefined, prompt: string, responseFormat?: Record<string, unknown>): Promise<LLMResult>;
}
```

## Development

```bash
npm run typecheck          # tsc --noEmit
npm run test               # 164 tests
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # tsdown
npm run validate:examples  # Validate all 13 fixtures
```

## Built-in Tools

| Tool | Description | Requires config |
| --- | --- | --- |
| `http.request` | Make an HTTP request and return the response status, headers, and body. | No |
| `html.select` | Extract data from HTML using CSS selectors. Returns text content, attribute values, or structured objects. | No |
| `gmail.search` | Search Gmail messages matching a query. | Google OAuth2 |
| `gmail.read` | Read a full Gmail message by ID. | Google OAuth2 |
| `gmail.send` | Send an email via Gmail. | Google OAuth2 |
| `sheets.read` | Read values from a Google Sheets range. | Google OAuth2 |
| `sheets.write` | Write values to a Google Sheets range (overwrites existing data). | Google OAuth2 |
| `sheets.append` | Append rows to a Google Sheets range. | Google OAuth2 |

`http.request` and `html.select` work out of the box with no configuration.

### Configuration

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required for LLM steps and workflow generation
GOOGLE_CLIENT_ID=...               # Required for Gmail and Sheets tools
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

The runtime gracefully degrades: missing `ANTHROPIC_API_KEY` → mock LLM adapter with a warning. Missing Google credentials → Google tools not registered (warning if a workflow references them).

### Google OAuth2 Setup

1. **Create a Google Cloud project** at [console.cloud.google.com](https://console.cloud.google.com).
2. **Enable APIs**: in the API Library, enable **Gmail API** and **Google Sheets API**.
3. **Create OAuth2 credentials**: go to APIs & Services → Credentials → Create Credentials → OAuth client ID. Choose **Desktop app**. Download the JSON and note the `client_id` and `client_secret`.
4. **Get a refresh token** using the [OAuth2 Playground](https://developers.google.com/oauthplayground):
   - Click the gear icon → check "Use your own OAuth credentials" → enter your `client_id` and `client_secret`.
   - In Step 1, add these scopes:
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/spreadsheets`
   - Click **Authorize APIs**, complete the consent flow, then click **Exchange authorization code for tokens**.
   - Copy the **Refresh token** value.
5. **Add to `.env`**:
   ```
   GOOGLE_CLIENT_ID=<your client_id>
   GOOGLE_CLIENT_SECRET=<your client_secret>
   GOOGLE_REFRESH_TOKEN=<your refresh_token>
   ```

### Verify tools are registered

```bash
npx tsx src/cli/index.ts run test/fixtures/echo.md -i '{"message": "hi"}'
```

To confirm Google tools specifically, run the validate command on any Gmail/Sheets workflow fixture and check that no "tool not registered" warnings appear.

## License

MIT
