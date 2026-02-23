import { describe, it, expect, vi } from 'vitest';
import { conversationalGenerate } from '../../src/generator/conversation.js';
import type { ConversationEvent } from '../../src/generator/conversation.js';
import type {
  ConversationalLLMAdapter,
  ConversationResult,
} from '../../src/types/index.js';

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

describe('conversationalGenerate', () => {
  it('generates workflow directly when LLM responds with frontmatter', async () => {
    const adapter = makeAdapter([textResult(VALID_WORKFLOW)]);
    const events: ConversationEvent[] = [];

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'You are a workflow author.',
      llmAdapter: adapter,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('test-workflow');
    expect(events.some((e) => e.type === 'generating')).toBe(true);
    expect(events.some((e) => e.type === 'workflow_generated')).toBe(true);
  });

  it('asks user and continues conversation before generating', async () => {
    const adapter = makeAdapter([
      textResult('What kind of data do you want to fetch?'),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];
    const userInputs = ['weather data', ''];  // Answer question, then accept
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

  it('handles pause_turn by continuing the loop without user input', async () => {
    // First response: pause_turn (server-side tool still running)
    // Second response: the actual result
    const pauseResponse: ConversationResult = {
      content: [
        { type: 'server_tool', raw: { type: 'server_tool_use', name: 'web_search', input: { query: 'test' } } },
      ],
      stopReason: 'pause_turn',
      tokens: { input: 10, output: 10 },
    };

    const adapter = makeAdapter([
      pauseResponse,
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];
    const getUserInput = vi.fn(async () => '');  // Accept at confirmation

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'You are a workflow author.',
      llmAdapter: adapter,
      getUserInput,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    // getUserInput should be called once — only for confirmation (not during pause_turn)
    expect(getUserInput).toHaveBeenCalledTimes(1);
    // Adapter should be called twice (pause + final)
    expect(adapter.converse).toHaveBeenCalledTimes(2);
  });

  it('passes server_tool content through in conversation history', async () => {
    const serverToolBlock = {
      type: 'server_tool' as const,
      raw: { type: 'server_tool_use', name: 'web_search', id: 'srvtoolu_123', input: { query: 'api docs' } },
    };
    const searchResultBlock = {
      type: 'server_tool' as const,
      raw: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_123', content: [{ title: 'result', url: 'https://example.com' }] },
    };

    const adapter = makeAdapter([
      // First turn: LLM uses server-side tool, then produces text
      {
        content: [
          serverToolBlock,
          searchResultBlock,
          { type: 'text', text: 'I found some info. What format do you want?' },
        ],
        stopReason: 'end_turn',
        tokens: { input: 20, output: 20 },
      },
      textResult(VALID_WORKFLOW),
    ]);

    const userInputs = ['JSON format', ''];  // Answer question, then accept
    let inputIndex = 0;

    const result = await conversationalGenerate({
      initialPrompt: 'research an API',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => userInputs[inputIndex++] ?? null,
      onEvent: () => {},
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    // Verify the second call includes the server_tool blocks in history
    const secondCallMessages = (adapter.converse as ReturnType<typeof vi.fn>).mock.calls[1]![2] as Array<{ role: string; content: unknown }>;
    const assistantMsg = secondCallMessages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    // The assistant message should contain server_tool blocks
    const contentBlocks = assistantMsg!.content as Array<{ type: string }>;
    const serverBlocks = contentBlocks.filter((b) => b.type === 'server_tool');
    expect(serverBlocks).toHaveLength(2);
  });

  it('emits tool events for server-side tool blocks', async () => {
    const adapter = makeAdapter([
      {
        content: [
          { type: 'server_tool', raw: { type: 'server_tool_use', name: 'web_search', input: { query: 'test' } } },
          { type: 'server_tool', raw: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] } },
          { type: 'text', text: VALID_WORKFLOW },
        ],
        stopReason: 'end_turn',
        tokens: { input: 10, output: 10 },
      },
    ]);
    const events: ConversationEvent[] = [];

    await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(events.some((e) => e.type === 'tool_call' && e.name === 'web_search')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result' && e.name === 'web_search')).toBe(true);
  });

  it('emits workflow_generated with errors when validation fails', async () => {
    const adapter = makeAdapter([
      textResult('---\nbad\n---\n```workflow\n```'),
    ]);
    const events: ConversationEvent[] = [];

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: false, errors: ['missing steps'] }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing steps');
    expect(result.attempts).toBe(1);
    // workflow_generated event should carry the errors
    const wfEvent = events.find((e) => e.type === 'workflow_generated');
    expect(wfEvent).toBeDefined();
    expect(wfEvent!.type === 'workflow_generated' && wfEvent!.valid).toBe(false);
    expect(wfEvent!.type === 'workflow_generated' && wfEvent!.errors).toContain('missing steps');
  });

  it('iterates on invalid workflow when user provides feedback', async () => {
    const adapter = makeAdapter([
      textResult('---\nbad\n---\n```workflow\n```'),
      textResult(VALID_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];
    let validateCount = 0;
    const userInputs = ['Please fix the errors', ''];  // Feedback, then accept
    let inputIndex = 0;

    const result = await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => userInputs[inputIndex++] ?? null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => {
        validateCount++;
        if (validateCount <= 1) {
          return { valid: false, errors: ['missing steps'] };
        }
        return { valid: true, errors: [] };
      },
    });

    expect(result.valid).toBe(true);
    expect(result.attempts).toBe(2);
    // Two workflow_generated events: first invalid, second valid
    const wfEvents = events.filter((e) => e.type === 'workflow_generated');
    expect(wfEvents).toHaveLength(2);
    expect(wfEvents[0]!.type === 'workflow_generated' && wfEvents[0]!.valid).toBe(false);
    expect(wfEvents[1]!.type === 'workflow_generated' && wfEvents[1]!.valid).toBe(true);
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

  it('does not pass tools argument to converse()', async () => {
    const adapter = makeAdapter([textResult(VALID_WORKFLOW)]);

    await conversationalGenerate({
      initialPrompt: 'test',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: () => {},
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    // converse() should be called with exactly 3 args (model, system, messages)
    expect(adapter.converse).toHaveBeenCalledWith(
      undefined,
      'test',
      expect.any(Array),
    );
  });

  it('iterates when user provides feedback after valid generation', async () => {
    const REVISED_WORKFLOW = VALID_WORKFLOW.replace('test-workflow', 'revised-workflow');
    const adapter = makeAdapter([
      textResult(VALID_WORKFLOW),
      textResult(REVISED_WORKFLOW),
    ]);
    const events: ConversationEvent[] = [];
    const userInputs = ['Add error handling', ''];  // Feedback, then accept
    let inputIndex = 0;

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => userInputs[inputIndex++] ?? null,
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('revised-workflow');
    // Adapter called twice: initial generation + iteration
    expect(adapter.converse).toHaveBeenCalledTimes(2);
    // Two workflow_generated events emitted
    const wfEvents = events.filter((e) => e.type === 'workflow_generated');
    expect(wfEvents).toHaveLength(2);
  });

  it('extracts workflow preceded by commentary text', async () => {
    const textWithCommentary = `Here's the workflow I created for you:\n\n${VALID_WORKFLOW}`;
    const adapter = makeAdapter([textResult(textWithCommentary)]);
    const events: ConversationEvent[] = [];

    const result = await conversationalGenerate({
      initialPrompt: 'make a workflow',
      systemPrompt: 'test',
      llmAdapter: adapter,
      getUserInput: async () => '',  // Accept at confirmation
      onEvent: (e) => events.push(e),
      validateGenerated: () => ({ valid: true, errors: [] }),
    });

    expect(result.valid).toBe(true);
    expect(result.content).toContain('test-workflow');
    // Commentary should be emitted as assistant_message
    const msgEvents = events.filter((e) => e.type === 'assistant_message');
    expect(msgEvents).toHaveLength(1);
    expect(msgEvents[0]!.type === 'assistant_message' && msgEvents[0]!.text).toContain("Here's the workflow");
  });
});
