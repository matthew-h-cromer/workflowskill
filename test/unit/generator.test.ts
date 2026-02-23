import { describe, it, expect, vi } from 'vitest';
import { generateWorkflow, generateWorkflowConversational } from '../../src/generator/index.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';
import type { ToolDescriptor } from '../../src/types/index.js';
import type { ConversationEvent } from '../../src/generator/conversation.js';

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

  it('returns errors when validation fails', async () => {
    const llm = new MockLLMAdapter(() => ({
      text: 'not valid yaml at all',
      tokens: { input: 50, output: 50 },
    }));

    const result = await generateWorkflow({
      prompt: 'impossible task',
      llmAdapter: llm,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.attempts).toBe(1);
  });

  it('toolDescriptors provides rich context to LLM prompt', async () => {
    let capturedPrompt = '';
    const llm = new MockLLMAdapter((_, prompt) => {
      capturedPrompt = prompt;
      return {
        text: `---\nname: test\ndescription: test\n---\n\n# Test\n\n\`\`\`workflow\ninputs: {}\noutputs: {}\nsteps:\n  - id: s1\n    type: tool\n    tool: gmail.search\n    inputs: {}\n    outputs: {}\n\`\`\``,
        tokens: { input: 100, output: 100 },
      };
    });

    const descriptors: ToolDescriptor[] = [
      {
        name: 'gmail.search',
        description: 'Search Gmail messages by query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
            max_results: { type: 'integer', description: 'Maximum results to return' },
          },
          required: ['query'],
        },
      },
    ];

    await generateWorkflow({
      prompt: 'search emails',
      llmAdapter: llm,
      toolDescriptors: descriptors,
    });

    expect(capturedPrompt).toContain('## Available Tools');
    expect(capturedPrompt).toContain('### gmail.search');
    expect(capturedPrompt).toContain('Search Gmail messages by query.');
    expect(capturedPrompt).toContain('query (string, required): The search query');
    expect(capturedPrompt).toContain('max_results (integer)');
  });

  it('toolDescriptors takes precedence over availableTools', async () => {
    let capturedPrompt = '';
    const llm = new MockLLMAdapter((_, prompt) => {
      capturedPrompt = prompt;
      return {
        text: `---\nname: test\ndescription: test\n---\n\n# Test\n\n\`\`\`workflow\ninputs: {}\noutputs: {}\nsteps:\n  - id: s1\n    type: tool\n    tool: rich.tool\n    inputs: {}\n    outputs: {}\n\`\`\``,
        tokens: { input: 100, output: 100 },
      };
    });

    await generateWorkflow({
      prompt: 'do thing',
      llmAdapter: llm,
      availableTools: ['plain.tool'],
      toolDescriptors: [{ name: 'rich.tool', description: 'Rich tool' }],
    });

    expect(capturedPrompt).toContain('### rich.tool');
    expect(capturedPrompt).not.toContain('Available tools: plain.tool');
  });

  it('availableTools still works alone (backward compat)', async () => {
    let capturedPrompt = '';
    const llm = new MockLLMAdapter((_, prompt) => {
      capturedPrompt = prompt;
      return {
        text: `---\nname: test\ndescription: test\n---\n\n# Test\n\n\`\`\`workflow\ninputs: {}\noutputs: {}\nsteps:\n  - id: s1\n    type: tool\n    tool: my_tool\n    inputs: {}\n    outputs: {}\n\`\`\``,
        tokens: { input: 100, output: 100 },
      };
    });

    await generateWorkflow({
      prompt: 'do thing',
      llmAdapter: llm,
      availableTools: ['my_tool', 'other_tool'],
    });

    expect(capturedPrompt).toContain('Available tools: my_tool, other_tool');
    expect(capturedPrompt).not.toContain('## Available Tools');
  });
});

const VALID_WORKFLOW = `---
name: test-wf
description: test
---

# Test

\`\`\`workflow
inputs:
  q:
    type: string
outputs:
  result:
    type: string
steps:
  - id: s1
    type: tool
    tool: test.tool
    inputs:
      q:
        type: string
        source: $inputs.q
    outputs:
      result:
        type: string
\`\`\`
`;

describe('generateWorkflowConversational', () => {
  it('generates directly when LLM outputs frontmatter', async () => {
    const llm = new MockLLMAdapter(undefined, () => ({
      content: [{ type: 'text', text: VALID_WORKFLOW }],
      stopReason: 'end_turn',
      tokens: { input: 50, output: 50 },
    }));
    const events: ConversationEvent[] = [];

    const result = await generateWorkflowConversational({
      prompt: 'make a workflow',
      llmAdapter: llm,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: (e) => events.push(e),
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('test-wf');
  });

  it('passes toolDescriptors to system prompt', async () => {
    let capturedSystem = '';
    const llm = new MockLLMAdapter(undefined, (_model, system) => {
      capturedSystem = system;
      return {
        content: [{ type: 'text', text: VALID_WORKFLOW }],
        stopReason: 'end_turn',
        tokens: { input: 50, output: 50 },
      };
    });

    await generateWorkflowConversational({
      prompt: 'test',
      llmAdapter: llm,
      toolDescriptors: [{ name: 'http.request', description: 'Make HTTP requests' }],
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: () => {},
    });

    expect(capturedSystem).toContain('### http.request');
    expect(capturedSystem).toContain('Make HTTP requests');
  });

  it('does not pass tools to converse() (server-side tools handled by adapter)', async () => {
    const converseSpy = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: VALID_WORKFLOW }],
      stopReason: 'end_turn' as const,
      tokens: { input: 50, output: 50 },
    }));
    const llm = new MockLLMAdapter(undefined, converseSpy);

    await generateWorkflowConversational({
      prompt: 'test',
      llmAdapter: llm,
      toolDescriptors: [
        { name: 'http.request', description: 'HTTP requests' },
        { name: 'gmail.send', description: 'Send email' },
      ],
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: () => {},
    });

    // converse() should be called with exactly 3 args (no tools)
    expect(converseSpy).toHaveBeenCalledWith(
      undefined,
      expect.any(String),
      expect.any(Array),
    );
  });
});
