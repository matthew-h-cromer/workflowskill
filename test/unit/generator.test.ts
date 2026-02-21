import { describe, it, expect } from 'vitest';
import { generateWorkflow } from '../../src/generator/index.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';

describe('generateWorkflow', () => {
  it('generates a valid workflow from LLM response', async () => {
    const llm = new MockLLMAdapter(() => ({
      text: `---
name: daily-summary
description: Summarize slack channels daily
---

# Daily Summary

\`\`\`workflow
inputs:
  channel:
    type: string

outputs:
  summary:
    type: string

steps:
  - id: fetch_messages
    type: tool
    description: Fetch channel messages
    tool: slack.get_messages
    inputs:
      channel:
        type: string
        source: $inputs.channel
    outputs:
      messages:
        type: array

  - id: summarize
    type: llm
    model: haiku
    prompt: |
      Summarize these messages: $steps.fetch_messages.output.messages
    inputs:
      messages:
        type: array
        source: $steps.fetch_messages.output.messages
    outputs:
      summary:
        type: string
\`\`\`
`,
      tokens: { input: 100, output: 200 },
    }));

    const result = await generateWorkflow({
      prompt: 'summarize my slack channels daily',
      llmAdapter: llm,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.attempts).toBe(1);
    expect(result.content).toContain('daily-summary');
    expect(result.content).toContain('```workflow');
  });

  it('retries on validation failure', async () => {
    let callCount = 0;
    const llm = new MockLLMAdapter(() => {
      callCount++;
      if (callCount === 1) {
        // First attempt: invalid YAML (no steps)
        return {
          text: '```workflow\ninputs: {}\noutputs: {}\nsteps: []\n```',
          tokens: { input: 50, output: 50 },
        };
      }
      // Second attempt: valid
      return {
        text: `---
name: fixed
description: Fixed workflow
---

# Fixed

\`\`\`workflow
inputs: {}
outputs: {}
steps:
  - id: do_thing
    type: tool
    tool: my_tool
    inputs: {}
    outputs: {}
\`\`\`
`,
        tokens: { input: 100, output: 150 },
      };
    });

    const result = await generateWorkflow({
      prompt: 'do something',
      llmAdapter: llm,
      maxAttempts: 3,
    });

    expect(result.valid).toBe(true);
    expect(result.attempts).toBe(2);
    expect(callCount).toBe(2);
  });

  it('returns errors after exhausting attempts', async () => {
    const llm = new MockLLMAdapter(() => ({
      text: 'not valid yaml at all',
      tokens: { input: 50, output: 50 },
    }));

    const result = await generateWorkflow({
      prompt: 'impossible task',
      llmAdapter: llm,
      maxAttempts: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.attempts).toBe(2);
  });

  it('handles raw YAML response (wraps automatically)', async () => {
    const llm = new MockLLMAdapter(() => ({
      text: `inputs:
  query:
    type: string
outputs:
  result:
    type: object
steps:
  - id: search
    type: tool
    tool: search_api
    inputs:
      q:
        type: string
        source: $inputs.query
    outputs:
      results:
        type: array`,
      tokens: { input: 50, output: 100 },
    }));

    const result = await generateWorkflow({
      prompt: 'search for things',
      llmAdapter: llm,
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('```workflow');
    expect(result.content).toContain('---');
  });
});
