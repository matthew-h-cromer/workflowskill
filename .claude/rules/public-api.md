---
paths:
  - "src/index.ts"
---

# Public API (`src/index.ts`)

Update this file whenever a public function or type is added or removed.

## Current Re-exports

- **Types:** All interfaces from `src/types/` (WorkflowDefinition, Step variants, RunLog, JsonSchema, ToolDescriptor, ServerToolContent, etc.)
- **Parser:** `parseSkillMd`, `parseWorkflowYaml`, `parseWorkflowFromMd`, `ParseError`
- **Expression:** `resolveExpression`, `interpolatePrompt`, `LexError`, `ParseExprError`, `EvalError`
- **Validator:** `validateWorkflow`
- **Executors:** `dispatch`, `executeTransform`, `executeConditional`, `executeExit`, `executeTool`, `executeLLM`, `StepExecutionError`
- **Runtime:** `runWorkflow`, `WorkflowExecutionError`
- **Generator:** `generateWorkflow`, `generateWorkflowConversational`, `conversationalGenerate`
- **Adapters:** `MockToolAdapter`, `MockLLMAdapter`, `AnthropicLLMAdapter`, `BuiltinToolAdapter`
- **Config:** `loadConfig`
