---
paths:
  - "src/adapters/**"
  - "src/dev-tools/**"
---

# Adapters and Dev Tools

## Dev Tools

Dev tools are local implementations for workflow authoring and testing. In production, the runtime's `ToolAdapter` is wired to the host agent ecosystem's tools instead.

| Tool | Description | Deps |
| --- | --- | --- |
| `http.request` | HTTP requests via Node fetch | None (built-in) |
| `html.select` | CSS selector extraction | cheerio |
| `gmail.search` | Search Gmail messages | @googleapis/gmail |
| `gmail.read` | Read full message by ID | @googleapis/gmail |
| `gmail.send` | Send email via Gmail | @googleapis/gmail |
| `sheets.read` | Read spreadsheet range | @googleapis/sheets |
| `sheets.write` | Write to spreadsheet range | @googleapis/sheets |
| `sheets.append` | Append rows to spreadsheet | @googleapis/sheets |

## ToolAdapter Interface

```typescript
interface ToolAdapter {
  invoke(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  has(toolName: string): boolean;
  list?(): ToolDescriptor[];  // optional
}
```

## LLMAdapter Interface

```typescript
interface LLMAdapter {
  call(model: string | undefined, prompt: string, responseFormat?: Record<string, unknown>): Promise<LLMResult>;
}
```

## Adding a New Dev Tool

1. Create `src/dev-tools/tools/<name>.ts` implementing the tool function
2. Register in `src/dev-tools/dev-tool-adapter.ts`
3. Add unit tests in `test/unit/<name>.test.ts`
4. Update this file
