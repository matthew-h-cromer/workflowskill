import { describe, it, expect, vi } from 'vitest';
import { conversationalGenerate } from '../../src/generator/conversation.js';
import type { ConversationEvent } from '../../src/generator/conversation.js';
import type {
  ConversationalLLMAdapter,
  ConversationMessage,
  ConversationResult,
  ConversationContent,
} from '../../src/types/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';

// Valid workflow SKILL.md content for testing
const VALID_WORKFLOW = `---
name: test-workflow
description: A test workflow
---

# Test Workflow

\`\`\`workflow
inputs:
  query:
    type: string

outputs:
  result:
    type: string

steps:
  - id: fetch
    type: tool
    tool: test.tool
    inputs:
      q:
        type: string
        source: $inputs.query
    outputs:
      result:
        type: string
\`\`\`
`;

function makeAdapter(responses: ConversationResult[]): ConversationalLLMAdapter {
  let callIndex = 0;
  return {
    call: vi.fn(async () => ({ text: '', tokens: { input: 0, output: 0 } })),
    converse: vi.fn(async () => {
      return responses[callIndex++] ?? responses[responses.length - 1]!;
    }),
  };
}

function textResult(text: string): ConversationResult {
  return {
    content: [{ type: 'text', text }],
    stopReason: 'end_turn',
    tokens: { input: 10, output: 10 },
  };
}

function toolUseResult(id: string, name: string, input: Record<string, unknown>): ConversationResult {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stopReason: 'tool_use',
    tokens: { input: 10, output: 10 },
  };
}

describe('conversationalGenerate', () => {
  it('generates workflow directly when LLM responds with frontmatter', async () => {
    const adapter = makeAdapter([textResult(VALID_WORKFLOW)]);
    const events: ConversationEvent[] = [];

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'You are a workflow author.',
      llmAdapter: adapter,
      getUserInput: async () => null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('test-workflow');
    expect(events.some((e) => e.type === 'generating')).toBe(true);
  });

  it('asks user and continues conversation before generating', async () => {
    const adapter = makeAdapter([
      textResult('What kind of data do you want to fetch?'),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];
    const userInputs = ['weather data'];
    let inputIndex = 0;

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'You are a workflow author.',
      llmAdapter: adapter,
      getUserInput: async () => userInputs[inputIndex++] ?? null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(events.some((e) => e.type === 'assistant_message')).toBe(true);
    // Verify the adapter was called twice (question + generation)
    expect(adapter.converse).toHaveBeenCalledTimes(2);
  });

  it('handles tool use during conversation', async () => {
    const adapter = makeAdapter([
      toolUseResult('call_1', 'http.request', { url: 'https://example.com' }),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];

    const toolAdapter = new MockToolAdapter();
    toolAdapter.register('http.request', () => ({
      output: { status: 200, body: 'ok' },
    }));

    const result = await conversationalGenerate({
      initialPrompt: 'fetch from an API',
      systemPrompt: 'You are a workflow author.',
      llmAdapter: adapter,
      toolAdapter,
      getUserInput: async () => null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
  });

  it('reports error for unavailable tools', async () => {
    const adapter = makeAdapter([
      toolUseResult('call_1', 'missing.tool', {}),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    const toolResultEvent = events.find(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(toolResultEvent).toBeDefined();
  });

  it('retries on validation failure up to maxFixAttempts', async () => {
    const adapter = makeAdapter([
      textResult('---\ninvalid workflow'),
      textResult('---\nstill invalid'),
      textResult(VALID_WORKFLOW),
    ]);
    let validateCount = 0;

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => null,
      onEvent: () => {},
      maxFixAttempts: 3,
      validateGenerated: () => {
        validateCount++;
        if (validateCount <= 2) {
          return { valid: false, errors: ['some error'] };
        }
        return { valid: true, errors: [] };
      },
    });

    expect(result.valid).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('returns errors when max fix attempts exhausted', async () => {
    const adapter = makeAdapter([
      textResult('---\nbad'),
      textResult('---\nstill bad'),
      textResult('---\nstill bad'),
    ]);

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => null,
      onEvent: () => {},
      maxFixAttempts: 2,
      validateGenerated: () => ({ valid: false, errors: ['parse error'] }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('parse error');
    expect(result.attempts).toBe(2);
  });

  it('aborts when user returns null', async () => {
    const adapter = makeAdapter([
      textResult('What do you want?'),
    ]);

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => null,
      onEvent: () => {},
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Generation aborted by user');
  });

  it('fails when maxTurns exceeded', async () => {
    // LLM keeps asking questions, never generates
    const adapter = makeAdapter([
      textResult('Question 1?'),
      textResult('Question 2?'),
      textResult('Question 3?'),
    ]);

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => 'answer',
      onEvent: () => {},
      maxTurns: 3,
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Maximum conversation turns exceeded');
  });

  it('passes conversation tools to converse()', async () => {
    const adapter = makeAdapter([textResult(VALID_WORKFLOW)]);
    const tools = [
      { name: 'http.request', description: 'Make HTTP requests', inputSchema: { type: 'object' } },
    ];

    await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      conversationTools: tools,
      getUserInput: async () => null,
      onEvent: () => {},
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(adapter.converse).toHaveBeenCalledWith(
      undefined,
      'test',
      expect.any(Array),
      tools,
    );
  });

  it('appends tool results to conversation history', async () => {
    const adapter = makeAdapter([
      toolUseResult('call_1', 'http.request', { url: 'https://example.com' }),
      textResult(VALID_WORKFLOW),
    ]);

    const toolAdapter = new MockToolAdapter();
    toolAdapter.register('http.request', () => ({
      output: { status: 200 },
    }));

    await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      toolAdapter,
      getUserInput: async () => null,
      onEvent: () => {},
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    // Second call should include tool result in messages
    const secondCallMessages = (adapter.converse as ReturnType<typeof vi.fn>).mock.calls[1]![2] as ConversationMessage[];
    const toolResultMsg = secondCallMessages.find(
      (m) => m.role === 'user' && Array.isArray(m.content),
    );
    expect(toolResultMsg).toBeDefined();
    const toolResultBlock = (toolResultMsg!.content as ConversationContent[]).find(
      (b) => b.type === 'tool_result',
    );
    expect(toolResultBlock).toBeDefined();
  });

  it('handles tool adapter errors gracefully', async () => {
    const adapter = makeAdapter([
      toolUseResult('call_1', 'http.request', { url: 'https://example.com' }),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];

    const toolAdapter = new MockToolAdapter();
    toolAdapter.register('http.request', () => {
      throw new Error('Network timeout');
    });

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      toolAdapter,
      getUserInput: async () => null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    const errorEvent = events.find(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'tool_result') {
      expect(errorEvent.output).toContain('Network timeout');
    }
  });
});
