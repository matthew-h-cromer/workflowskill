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
  availableTools: ['gmail.search', 'slack.post_message'],
});
```

### Adapters

`ToolAdapter` and `LLMAdapter` are the integration boundaries. Mock implementations are provided for testing.

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
}

interface LLMAdapter {
  call(model: string | undefined, prompt: string, responseFormat?: Record<string, unknown>): Promise<LLMResult>;
}
```

## Development

```bash
npm run typecheck          # tsc --noEmit
npm run test               # 150 tests
npm run test:coverage      # With coverage report
npm run lint               # ESLint
npm run build              # tsdown
npm run validate:examples  # Validate all 13 fixtures
```

## License

MIT
