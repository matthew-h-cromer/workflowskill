---
paths:
  - "src/adapters/**"
  - "src/tools/**"
---

# Adapters and Builtin Tools

## Bundled Tools

Builtin tools ship with the package. Additional tools can be registered via a custom `ToolAdapter`.

| Tool | Description | Deps |
| --- | --- | --- |
| `web.scrape` | Fetch a URL and extract data via CSS selectors | cheerio |

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

## Adding a New Tool

1. Create `src/tools/<name>.ts` implementing the tool function
2. Register in `src/tools/builtin-tool-adapter.ts`
3. Add unit tests in `test/unit/<name>.test.ts`
4. Update this file
