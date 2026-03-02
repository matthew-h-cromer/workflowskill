# Coding Patterns

## Tech Stack

TypeScript (strict), Node >=20, ESM only. Vitest for tests. Zod for schema validation. `yaml` (eemeli) for YAML parsing. Commander.js for CLI. tsdown for builds. `@anthropic-ai/sdk` for LLM calls. `cheerio` for HTML parsing.

## ESM Imports

All local imports must use `.js` extensions:

```typescript
import type { RuntimeContext } from '../types/index.js';
import { lex } from './lexer.js';
export { LexError } from './lexer.js';
```

## `noUncheckedIndexedAccess`

`tsconfig.json` enables `noUncheckedIndexedAccess`. Guard all array/object indexed access:

```typescript
// After bounds check, use non-null assertion
while (pos < input.length) {
  const ch = input[pos]!;  // safe: pos < input.length
}
```

## Custom Error Classes

Extend `Error`, set `this.name`, use `readonly` context properties:

```typescript
export class StepExecutionError extends Error {
  constructor(
    message: string,
    public readonly isRetriable: boolean,
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}
```

## Conventions

- All types in `src/types/`, imported everywhere else
- Zod schemas in `src/parser/schema.ts` are the runtime validation layer
- Adapters (`src/adapters/`) isolate all external dependencies (tools, LLM)
- Every public function has a corresponding test
- Error messages include context: which step failed, what expression was invalid, expected vs. actual type
