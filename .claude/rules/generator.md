---
paths:
  - "src/generator/**"
  - "src/cli/generate.ts"
  - "src/adapters/anthropic-llm-adapter.ts"
---

# Generator

## Generation Modes

- **Single-shot:** `generateWorkflow(adapter, prompt, toolDescriptors?)` — one LLM call + validate
- **Multi-turn:** `generateWorkflowConversational(adapter, prompt, toolDescriptors?)` — high-level entry point
- **Low-level loop:** `conversationalGenerate(adapter, model, system, messages, toolDescriptors?)` — drives the conversation turn by turn
- **Validation retry:** on parse/validate failure, errors are fed back to the LLM for correction

## Server-Side Tools

`web_search` and `web_fetch` are **Anthropic SDK server-side tools**, NOT local tools. They are configured in `AnthropicLLMAdapter` and passed to the API. The generator conversation does NOT pass local tools to the API. Server-side tool response blocks are passed through as opaque `ServerToolContent` in conversation history.

## Conversation Interface

`ConversationalLLMAdapter` extends `LLMAdapter` with:
```typescript
converse(model, system, messages) → Promise<ConversationResult>
```

## Workflow-Author Skill

`src/generator/workflow-author.md` is the **primary quality lever** for generation. When generated workflows have issues, the fix belongs in the skill.

- **Platform-agnostic** — must NOT contain instructions about specific tools (http.request, gmail.send, etc.)
- Tool-specific knowledge is conveyed via `toolDescriptors` passed to the generator and appended at generation time
- Focus improvements on structural guidance, not tool documentation
