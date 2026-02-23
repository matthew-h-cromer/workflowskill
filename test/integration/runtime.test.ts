import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflowFromMd } from '../../src/parser/index.js';
import { runWorkflow, buildFailedRunLog } from '../../src/runtime/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';
import type { RuntimeEvent } from '../../src/types/index.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

function loadWorkflow(name: string) {
  const content = readFileSync(join(FIXTURES, `${name}.md`), 'utf-8');
  return parseWorkflowFromMd(content);
}

// ─── 1. echo ──────────────────────────────────────────────────────────────────

describe('echo workflow', () => {
  it('passes input through a single transform step', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { message: 'hello' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
    });

    expect(log.status).toBe('success');
    expect(log.workflow).toBe('echo');
    expect(log.inputs).toEqual({ message: 'hello' });
    expect(log.steps).toHaveLength(1);
    expect(log.steps[0]!.id).toBe('echo');
    expect(log.steps[0]!.status).toBe('success');
    expect(log.steps[0]!.executor).toBe('transform');
    // Transform wraps output in first output key
    expect(log.steps[0]!.output).toEqual({ mapped: [{ value: 'hello' }] });
    expect(log.summary.steps_executed).toBe(1);
    expect(log.summary.steps_skipped).toBe(0);
    expect(log.summary.total_tokens).toBe(0);
  });

  it('uses default input when none provided', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
    });

    expect(log.status).toBe('success');
    expect(log.inputs).toEqual({ message: 'hello' });
  });
});

// ─── 2. two-step-pipe ────────────────────────────────────────────────────────

describe('two-step-pipe workflow', () => {
  it('pipes tool output to transform via $steps references', async () => {
    const workflow = loadWorkflow('two-step-pipe');
    const tools = new MockToolAdapter();
    tools.register('search', (args) => ({
      output: {
        results: [
          { title: `Result for ${args.query}`, url: 'https://example.com' },
          { title: 'Another result', url: 'https://other.com' },
        ],
      },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { query: 'test' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'two-step-pipe',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(2);
    expect(log.steps[0]!.id).toBe('fetch');
    expect(log.steps[0]!.status).toBe('success');
    expect(log.steps[1]!.id).toBe('reshape');
    expect(log.steps[1]!.status).toBe('success');
    expect(log.steps[1]!.output).toEqual({
      mapped: [
        { title: 'Result for test', url: 'https://example.com' },
        { title: 'Another result', url: 'https://other.com' },
      ],
    });
  });
});

// ─── 3. llm-judgment ────────────────────────────────────────────────────────

describe('llm-judgment workflow', () => {
  it('invokes tool then LLM with prompt interpolation', async () => {
    const workflow = loadWorkflow('llm-judgment');
    const tools = new MockToolAdapter();
    tools.register('gmail_fetch', () => ({
      output: {
        messages: [
          { from: 'alice@example.com', subject: 'Urgent', body: 'Please review' },
        ],
      },
    }));

    let capturedPrompt = '';
    const llm = new MockLLMAdapter((_model, prompt) => {
      capturedPrompt = prompt;
      return {
        text: JSON.stringify([{ score: 8, summary: 'Urgent email' }]),
        tokens: { input: 25, output: 15 },
      };
    });

    const log = await runWorkflow({
      workflow,
      inputs: { account: 'test@example.com' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'llm-judgment',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(2);
    expect(log.steps[0]!.id).toBe('fetch_emails');
    expect(log.steps[1]!.id).toBe('score');
    expect(log.steps[1]!.executor).toBe('llm');
    expect(log.steps[1]!.tokens).toEqual({ input: 25, output: 15 });
    expect(log.summary.total_tokens).toBe(40);
    // Prompt should have been interpolated with the messages
    expect(capturedPrompt).toContain('alice@example.com');
  });
});

// ─── 4. filter-exit ─────────────────────────────────────────────────────────

describe('filter-exit workflow', () => {
  it('filters items and exits through then branch when empty', async () => {
    const workflow = loadWorkflow('filter-exit');
    const tools = new MockToolAdapter();
    tools.register('get_items', () => ({
      output: { items: [{ score: 1 }, { score: 3 }] },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { threshold: 7 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'filter-exit',
    });

    expect(log.status).toBe('success');
    // fetch, filter_high, check_empty, exit_empty executed
    const executedIds = log.steps.filter((s) => s.status === 'success').map((s) => s.id);
    expect(executedIds).toContain('fetch');
    expect(executedIds).toContain('filter_high');
    expect(executedIds).toContain('check_empty');
    expect(executedIds).toContain('exit_empty');
  });

  it('exits through else branch when items found', async () => {
    const workflow = loadWorkflow('filter-exit');
    const tools = new MockToolAdapter();
    tools.register('get_items', () => ({
      output: { items: [{ score: 8 }, { score: 9 }, { score: 2 }] },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { threshold: 7 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'filter-exit',
    });

    expect(log.status).toBe('success');
    const executedIds = log.steps.filter((s) => s.status === 'success').map((s) => s.id);
    expect(executedIds).toContain('exit_success');
    // exit_empty should be skipped (branch not selected)
    const skippedIds = log.steps.filter((s) => s.status === 'skipped').map((s) => s.id);
    expect(skippedIds).toContain('exit_empty');
  });
});

// ─── 5. branch ──────────────────────────────────────────────────────────────

describe('branch workflow', () => {
  it('takes then branch when condition is true', async () => {
    const workflow = loadWorkflow('branch');
    const tools = new MockToolAdapter();
    tools.register('validate', () => ({
      output: { valid: true },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { value: 42 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'branch',
    });

    expect(log.status).toBe('success');
    const executedIds = log.steps.filter((s) => s.status === 'success').map((s) => s.id);
    expect(executedIds).toContain('check');
    expect(executedIds).toContain('branch');
    expect(executedIds).toContain('exit_success');
    const skippedIds = log.steps.filter((s) => s.status === 'skipped').map((s) => s.id);
    expect(skippedIds).toContain('exit_failed');
  });

  it('takes else branch when condition is false', async () => {
    const workflow = loadWorkflow('branch');
    const tools = new MockToolAdapter();
    tools.register('validate', () => ({
      output: { valid: false },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { value: -1 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'branch',
    });

    expect(log.status).toBe('failed');
    const executedIds = log.steps.filter((s) => s.status === 'success').map((s) => s.id);
    expect(executedIds).toContain('exit_failed');
    const skippedIds = log.steps.filter((s) => s.status === 'skipped').map((s) => s.id);
    expect(skippedIds).toContain('exit_success');
  });
});

// ─── 6. each-loop ────────────────────────────────────────────────────────────

describe('each-loop workflow', () => {
  it('iterates LLM step over each document', async () => {
    const workflow = loadWorkflow('each-loop');
    const tools = new MockToolAdapter();
    tools.register('get_documents', () => ({
      output: {
        documents: [
          { id: 1, content: 'First document content' },
          { id: 2, content: 'Second document content' },
          { id: 3, content: 'Third document content' },
        ],
      },
    }));

    const prompts: string[] = [];
    const llm = new MockLLMAdapter((_model, prompt) => {
      prompts.push(prompt);
      return {
        text: `Summary of: ${prompt.slice(0, 30)}`,
        tokens: { input: 15, output: 10 },
      };
    });

    const log = await runWorkflow({
      workflow,
      inputs: { items: ['doc1', 'doc2', 'doc3'] },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'each-loop',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(2);

    // Summarize step has iterations
    const summarizeRecord = log.steps.find((s) => s.id === 'summarize')!;
    expect(summarizeRecord.iterations).toBe(3);
    expect(summarizeRecord.tokens).toEqual({ input: 45, output: 30 });
    expect(Array.isArray(summarizeRecord.output)).toBe(true);
    expect((summarizeRecord.output as unknown[]).length).toBe(3);
    expect(log.summary.total_tokens).toBe(75);

    // Each prompt should contain the document content
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain('First document content');
    expect(prompts[1]).toContain('Second document content');
    expect(prompts[2]).toContain('Third document content');
  });
});

// ─── 7. error-fail ──────────────────────────────────────────────────────────

describe('error-fail workflow', () => {
  it('halts workflow when tool fails with on_error: fail', async () => {
    const workflow = loadWorkflow('error-fail');
    const tools = new MockToolAdapter();
    tools.register('unreliable_api', () => ({
      output: null,
      error: 'Connection refused',
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'error-fail',
    });

    expect(log.status).toBe('failed');

    // failing_tool should be recorded as failed with enriched error
    const failingRecord = log.steps.find((s) => s.id === 'failing_tool')!;
    expect(failingRecord.status).toBe('failed');
    expect(failingRecord.error).toBe('Tool "unreliable_api": Connection refused');
    expect(failingRecord.inputs).toBeDefined();

    // process step should be skipped (workflow halted)
    const processRecord = log.steps.find((s) => s.id === 'process')!;
    expect(processRecord.status).toBe('skipped');
    expect(processRecord.reason).toBe('Workflow halted');
  });
});

// ─── 8. error-ignore ────────────────────────────────────────────────────────

describe('error-ignore workflow', () => {
  it('continues with null output when tool fails with on_error: ignore', async () => {
    const workflow = loadWorkflow('error-ignore');
    const tools = new MockToolAdapter();
    tools.register('unreliable_api', () => ({
      output: null,
      error: 'Service unavailable',
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'error-ignore',
    });

    expect(log.status).toBe('success');

    // failing_tool recorded as failed with enriched error but workflow continues
    const failingRecord = log.steps.find((s) => s.id === 'failing_tool')!;
    expect(failingRecord.status).toBe('failed');
    expect(failingRecord.error).toBe('Tool "unreliable_api": Service unavailable');
    expect(failingRecord.inputs).toBeDefined();

    // process step still runs (gets null from failed step)
    const processRecord = log.steps.find((s) => s.id === 'process')!;
    expect(processRecord.status).toBe('success');
    // Transform on null/empty input produces empty array
    expect(processRecord.output).toEqual({ result: [] });

    expect(log.summary.steps_executed).toBe(2);
  });
});

// ─── 9. retry-backoff ────────────────────────────────────────────────────────

describe('retry-backoff workflow', () => {
  it('retries with backoff and succeeds on third attempt', async () => {
    const workflow = loadWorkflow('retry-backoff');
    const tools = new MockToolAdapter();

    let callCount = 0;
    tools.register('flaky_api', () => {
      callCount++;
      if (callCount < 3) {
        return { output: null, error: 'Temporary failure' };
      }
      return { output: { data: { success: true, attempt: callCount } } };
    });
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'retry-backoff',
    });

    expect(log.status).toBe('success');
    expect(callCount).toBe(3); // 1 initial + 2 retries
    const record = log.steps[0]!;
    expect(record.status).toBe('success');
    expect(record.output).toEqual({ data: { success: true, attempt: 3 } });
    // Should have retry data: 2 attempts before success
    expect(record.retries).toBeDefined();
    expect(record.retries!.attempts).toBe(2);
    expect(record.retries!.errors).toHaveLength(2);
    expect(record.retries!.errors[0]).toBe('Temporary failure');
    expect(record.retries!.errors[1]).toBe('Temporary failure');
  }, 10000); // longer timeout for retries with actual delays

  it('fails after exhausting retries', async () => {
    const workflow = loadWorkflow('retry-backoff');
    const tools = new MockToolAdapter();

    // Always fails
    tools.register('flaky_api', () => ({
      output: null,
      error: 'Permanent failure',
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'retry-backoff',
    });

    // on_error defaults to 'fail', so workflow fails
    expect(log.status).toBe('failed');
    const record = log.steps[0]!;
    expect(record.status).toBe('failed');
    expect(record.error).toBe('Tool "flaky_api": Permanent failure');
    // Should have retry data: 3 retry attempts that all failed
    expect(record.retries).toBeDefined();
    expect(record.retries!.attempts).toBe(3);
    expect(record.retries!.errors).toHaveLength(3);
    expect(record.retries!.errors[0]).toBe('Permanent failure');
  }, 10000);
});

// ─── 10. sort-pipeline ──────────────────────────────────────────────────────

describe('sort-pipeline workflow', () => {
  it('sorts records then reshapes with multi-transform chain', async () => {
    const workflow = loadWorkflow('sort-pipeline');
    const tools = new MockToolAdapter();
    tools.register('get_records', () => ({
      output: {
        records: [
          { name: 'Alice', score: 75 },
          { name: 'Charlie', score: 95 },
          { name: 'Bob', score: 85 },
        ],
      },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'sort-pipeline',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(3);

    // Sort step produces sorted array (desc by score)
    const sortRecord = log.steps.find((s) => s.id === 'sort_by_score')!;
    expect(sortRecord.status).toBe('success');
    const sorted = (sortRecord.output as Record<string, unknown>).sorted as Array<Record<string, unknown>>;
    expect(sorted[0]!.name).toBe('Charlie');
    expect(sorted[1]!.name).toBe('Bob');
    expect(sorted[2]!.name).toBe('Alice');

    // Reshape step produces mapped output
    const reshapeRecord = log.steps.find((s) => s.id === 'reshape')!;
    expect(reshapeRecord.status).toBe('success');
    expect(reshapeRecord.output).toEqual({
      mapped: [
        { name: 'Charlie', score: 95 },
        { name: 'Bob', score: 85 },
        { name: 'Alice', score: 75 },
      ],
    });
  });
});

// ─── Run log structure ──────────────────────────────────────────────────────

describe('run log structure', () => {
  it('has all required fields per spec', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { message: 'test' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
    });

    expect(log.id).toBeTruthy();
    expect(log.workflow).toBe('echo');
    expect(log.status).toBe('success');
    expect(log.started_at).toBeTruthy();
    expect(log.completed_at).toBeTruthy();
    expect(typeof log.duration_ms).toBe('number');
    expect(log.inputs).toBeDefined();
    expect(log.outputs).toBeDefined();
    expect(Array.isArray(log.steps)).toBe(true);
    expect(log.summary).toBeDefined();
    expect(typeof log.summary.steps_executed).toBe('number');
    expect(typeof log.summary.steps_skipped).toBe('number');
    expect(typeof log.summary.total_tokens).toBe('number');
    expect(typeof log.summary.total_duration_ms).toBe('number');
  });

  it('returns a failed RunLog for invalid workflow (validation phase)', async () => {
    const workflow = {
      inputs: {},
      outputs: {},
      steps: [
        {
          id: 'a',
          type: 'tool' as const,
          tool: 'missing_tool',
          inputs: {},
          outputs: {},
        },
      ],
    };
    const tools = new MockToolAdapter(); // missing_tool not registered
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'bad-workflow',
    });

    expect(log.status).toBe('failed');
    expect(log.workflow).toBe('bad-workflow');
    expect(log.steps).toHaveLength(0);
    expect(log.error).toBeDefined();
    expect(log.error!.phase).toBe('validate');
    expect(log.error!.message).toContain('missing_tool');
  });
});

// ─── 11. output-source ──────────────────────────────────────────────────────

describe('output-source workflow', () => {
  it('maps step output via $result and workflow output via $steps', async () => {
    const workflow = loadWorkflow('output-source');
    const tools = new MockToolAdapter();
    tools.register('http.request', () => ({
      output: {
        status: 200,
        body: { userId: 1, id: 1, title: 'delectus aut autem', completed: false },
      },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'output-source',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(1);

    // Step output should be mapped via $result.body.title and $result.body.userId
    const fetchRecord = log.steps[0]!;
    expect(fetchRecord.output).toEqual({ title: 'delectus aut autem', user_id: 1 });

    // Workflow outputs resolved via $steps
    expect(log.outputs).toEqual({ title: 'delectus aut autem', user_id: 1 });
  });
});

// ─── 12. output-source-with-exit ─────────────────────────────────────────────

describe('output-source-with-exit workflow', () => {
  it('resolves workflow output source when exit does not fire', async () => {
    const workflow = loadWorkflow('output-source-with-exit');
    const tools = new MockToolAdapter();
    tools.register('http.request', () => ({
      output: {
        status: 200,
        body: { title: 'Test Data', items: [1, 2, 3] },
      },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { should_exit: false },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'output-source-with-exit',
    });

    expect(log.status).toBe('success');

    // exit was skipped
    const exitRecord = log.steps.find((s) => s.id === 'early_exit')!;
    expect(exitRecord.status).toBe('skipped');

    // Workflow outputs resolved via source expressions
    expect(log.outputs).toEqual({ message: 'Test Data', count: 3 });
  });

  it('exit output takes precedence over workflow output source', async () => {
    const workflow = loadWorkflow('output-source-with-exit');
    const tools = new MockToolAdapter();
    tools.register('http.request', () => ({
      output: {
        status: 200,
        body: { title: 'Test Data', items: [1, 2, 3] },
      },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { should_exit: true },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'output-source-with-exit',
    });

    expect(log.status).toBe('success');

    // exit fired
    const exitRecord = log.steps.find((s) => s.id === 'early_exit')!;
    expect(exitRecord.status).toBe('success');

    // Exit output takes precedence
    expect(log.outputs).toEqual({ message: 'exited early', count: 0 });
  });
});

// ─── Step record inputs ──────────────────────────────────────────────────────

describe('step record inputs', () => {
  it('records resolved inputs on successful steps', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { message: 'hello' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
    });

    const echoRecord = log.steps.find((s) => s.id === 'echo')!;
    expect(echoRecord.inputs).toEqual({ data: 'hello' });
  });

  it('records resolved inputs on tool steps', async () => {
    const workflow = loadWorkflow('two-step-pipe');
    const tools = new MockToolAdapter();
    tools.register('search', (args) => ({
      output: { results: [{ title: `Result for ${args.query}`, url: 'https://example.com' }] },
    }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { query: 'test' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'two-step-pipe',
    });

    const fetchRecord = log.steps.find((s) => s.id === 'fetch')!;
    expect(fetchRecord.inputs).toEqual({ query: 'test' });
  });

  it('does not include inputs on skipped steps', async () => {
    const workflow = loadWorkflow('branch');
    const tools = new MockToolAdapter();
    tools.register('validate', () => ({ output: { valid: true } }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { value: 42 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'branch',
    });

    const skippedRecords = log.steps.filter((s) => s.status === 'skipped');
    for (const rec of skippedRecords) {
      expect(rec.inputs).toBeUndefined();
    }
  });
});

// ─── 13. each-tool-dynamic-url ───────────────────────────────────────────────

describe('each-tool-dynamic-url workflow', () => {
  it('constructs dynamic URLs per-iteration using + operator and maps $result output', async () => {
    const workflow = loadWorkflow('each-tool-dynamic-url');

    const capturedUrls: string[] = [];
    const tools = new MockToolAdapter();
    tools.register('get_ids', () => ({
      output: { ids: [101, 202, 303] },
    }));
    tools.register('http.request', (args) => {
      capturedUrls.push(args.url as string);
      const id = args.url as string;
      const itemId = parseInt((id as string).replace(/.*\/(\d+)\.json$/, '$1'), 10);
      return {
        output: {
          status: 200,
          body: { id: itemId, title: `Item ${itemId}` },
        },
      };
    });
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { base_url: 'https://api.example.com/item/' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'each-tool-dynamic-url',
    });

    expect(log.status).toBe('success');
    expect(log.steps).toHaveLength(2);

    // Verify dynamic URLs were constructed correctly per iteration
    expect(capturedUrls).toEqual([
      'https://api.example.com/item/101.json',
      'https://api.example.com/item/202.json',
      'https://api.example.com/item/303.json',
    ]);

    // Verify per-iteration output mapping via $result
    const fetchRecord = log.steps.find((s) => s.id === 'fetch_details')!;
    expect(fetchRecord.status).toBe('success');
    expect(fetchRecord.iterations).toBe(3);
    expect(Array.isArray(fetchRecord.output)).toBe(true);
    const outputArr = fetchRecord.output as Array<Record<string, unknown>>;
    expect(outputArr).toEqual([
      { title: 'Item 101', id: 101 },
      { title: 'Item 202', id: 202 },
      { title: 'Item 303', id: 303 },
    ]);

    // Workflow output maps the array via $steps reference
    expect(log.outputs).toEqual({
      details: [
        { title: 'Item 101', id: 101 },
        { title: 'Item 202', id: 202 },
        { title: 'Item 303', id: 303 },
      ],
    });
  });
});

// ─── buildFailedRunLog ────────────────────────────────────────────────────────

describe('buildFailedRunLog', () => {
  it('produces a failed RunLog with correct structure for parse phase', () => {
    const before = new Date();
    const log = buildFailedRunLog('my-workflow', {
      phase: 'parse',
      message: 'YAML syntax error on line 3',
    });

    expect(log.status).toBe('failed');
    expect(log.workflow).toBe('my-workflow');
    expect(log.steps).toHaveLength(0);
    expect(log.outputs).toEqual({});
    expect(log.inputs).toEqual({});
    expect(log.summary.steps_executed).toBe(0);
    expect(log.summary.steps_skipped).toBe(0);
    expect(log.summary.total_tokens).toBe(0);
    expect(log.error).toBeDefined();
    expect(log.error!.phase).toBe('parse');
    expect(log.error!.message).toBe('YAML syntax error on line 3');
    expect(log.error!.details).toBeUndefined();
    expect(log.id).toBeTruthy();
    expect(new Date(log.started_at).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(new Date(log.completed_at).getTime()).toBeGreaterThanOrEqual(new Date(log.started_at).getTime());
  });

  it('includes details when provided', () => {
    const log = buildFailedRunLog('my-workflow', {
      phase: 'validate',
      message: 'Workflow validation failed: missing tool',
      details: [{ path: 'steps[0].tool', message: 'Tool "foo" is not registered' }],
    });

    expect(log.error!.phase).toBe('validate');
    expect(log.error!.details).toHaveLength(1);
    expect(log.error!.details![0]!.path).toBe('steps[0].tool');
  });

  it('uses provided startedAt timestamp', () => {
    const startedAt = new Date('2024-01-01T00:00:00.000Z');
    const log = buildFailedRunLog('wf', { phase: 'execute', message: 'crash' }, startedAt);
    expect(log.started_at).toBe('2024-01-01T00:00:00.000Z');
  });
});

// ─── Runtime events ──────────────────────────────────────────────────────────

describe('runtime events', () => {
  it('emits workflow_start and workflow_complete for basic workflow', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { message: 'hello' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
      onEvent: (e) => events.push(e),
    });

    const start = events.find((e) => e.type === 'workflow_start');
    expect(start).toBeDefined();
    expect(start).toMatchObject({ type: 'workflow_start', workflow: 'echo', totalSteps: 1 });

    const complete = events.find((e) => e.type === 'workflow_complete');
    expect(complete).toBeDefined();
    expect(complete).toMatchObject({ type: 'workflow_complete', status: 'success' });
    if (complete?.type === 'workflow_complete') {
      expect(typeof complete.duration_ms).toBe('number');
      expect(complete.summary.steps_executed).toBe(1);
      expect(complete.summary.steps_skipped).toBe(0);
    }
  });

  it('emits step_start and step_complete for each executed step', async () => {
    const workflow = loadWorkflow('two-step-pipe');
    const tools = new MockToolAdapter();
    tools.register('search', (args) => ({
      output: { results: [{ title: `Result for ${args.query}`, url: 'https://example.com' }] },
    }));
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { query: 'test' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'two-step-pipe',
      onEvent: (e) => events.push(e),
    });

    const stepStarts = events.filter((e) => e.type === 'step_start');
    const stepCompletes = events.filter((e) => e.type === 'step_complete');

    expect(stepStarts).toHaveLength(2);
    expect(stepCompletes).toHaveLength(2);

    // fetch step: tool type with tool name
    const fetchStart = stepStarts.find((e) => e.type === 'step_start' && e.stepId === 'fetch');
    expect(fetchStart).toMatchObject({ type: 'step_start', stepId: 'fetch', stepType: 'tool', tool: 'search' });

    // reshape step: transform type, no tool
    const reshapeStart = stepStarts.find((e) => e.type === 'step_start' && e.stepId === 'reshape');
    expect(reshapeStart).toMatchObject({ type: 'step_start', stepId: 'reshape', stepType: 'transform' });
    if (reshapeStart?.type === 'step_start') expect(reshapeStart.tool).toBeUndefined();

    // All completes have status 'success'
    for (const e of stepCompletes) {
      if (e.type === 'step_complete') {
        expect(e.status).toBe('success');
        expect(typeof e.duration_ms).toBe('number');
      }
    }
  });

  it('emits step_skip for guard false', async () => {
    const workflow = loadWorkflow('branch');
    const tools = new MockToolAdapter();
    tools.register('validate', () => ({ output: { valid: true } }));
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { value: 42 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'branch',
      onEvent: (e) => events.push(e),
    });

    const skips = events.filter((e) => e.type === 'step_skip');
    expect(skips.length).toBeGreaterThan(0);

    // exit_failed should be skipped (branch not selected)
    const exitFailedSkip = skips.find((e) => e.type === 'step_skip' && e.stepId === 'exit_failed');
    expect(exitFailedSkip).toBeDefined();
    if (exitFailedSkip?.type === 'step_skip') {
      expect(exitFailedSkip.reason).toBe('Branch not selected');
    }
  });

  it('emits step_retry on retry attempts', async () => {
    const workflow = loadWorkflow('retry-backoff');
    const tools = new MockToolAdapter();
    let callCount = 0;
    tools.register('flaky_api', () => {
      callCount++;
      if (callCount < 3) return { output: null, error: 'Temporary failure' };
      return { output: { data: { success: true, attempt: callCount } } };
    });
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'retry-backoff',
      onEvent: (e) => events.push(e),
    });

    const retries = events.filter((e) => e.type === 'step_retry');
    expect(retries).toHaveLength(2);
    if (retries[0]?.type === 'step_retry') {
      expect(retries[0].attempt).toBe(1);
      expect(retries[0].error).toBe('Temporary failure');
    }
    if (retries[1]?.type === 'step_retry') {
      expect(retries[1].attempt).toBe(2);
    }
  }, 10000);

  it('emits step_error with on_error: fail', async () => {
    const workflow = loadWorkflow('error-fail');
    const tools = new MockToolAdapter();
    tools.register('unreliable_api', () => ({ output: null, error: 'Connection refused' }));
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'error-fail',
      onEvent: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === 'step_error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'step_error') {
      expect(errorEvent.stepId).toBe('failing_tool');
      expect(errorEvent.onError).toBe('fail');
      expect(errorEvent.error).toContain('Connection refused');
    }

    // step_complete with status 'failed' should follow step_error
    const failComplete = events.find(
      (e) => e.type === 'step_complete' && e.stepId === 'failing_tool',
    );
    expect(failComplete).toBeDefined();
    if (failComplete?.type === 'step_complete') {
      expect(failComplete.status).toBe('failed');
    }
  });

  it('emits step_error with on_error: ignore', async () => {
    const workflow = loadWorkflow('error-ignore');
    const tools = new MockToolAdapter();
    tools.register('unreliable_api', () => ({ output: null, error: 'Service unavailable' }));
    const llm = new MockLLMAdapter();
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'error-ignore',
      onEvent: (e) => events.push(e),
    });

    const errorEvent = events.find((e) => e.type === 'step_error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'step_error') {
      expect(errorEvent.onError).toBe('ignore');
    }

    // workflow_complete should still be success (on_error: ignore)
    const complete = events.find((e) => e.type === 'workflow_complete');
    expect(complete).toMatchObject({ type: 'workflow_complete', status: 'success' });
  });

  it('emits each_progress during iteration', async () => {
    const workflow = loadWorkflow('each-loop');
    const tools = new MockToolAdapter();
    tools.register('get_documents', () => ({
      output: {
        documents: [
          { id: 1, content: 'First' },
          { id: 2, content: 'Second' },
          { id: 3, content: 'Third' },
        ],
      },
    }));
    const llm = new MockLLMAdapter((_model, prompt) => ({
      text: `Summary of: ${prompt.slice(0, 20)}`,
      tokens: { input: 10, output: 5 },
    }));
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { items: ['doc1', 'doc2', 'doc3'] },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'each-loop',
      onEvent: (e) => events.push(e),
    });

    const progressEvents = events.filter((e) => e.type === 'each_progress' && e.stepId === 'summarize');
    expect(progressEvents).toHaveLength(3);
    expect(progressEvents[0]).toMatchObject({ type: 'each_progress', current: 1, total: 3 });
    expect(progressEvents[1]).toMatchObject({ type: 'each_progress', current: 2, total: 3 });
    expect(progressEvents[2]).toMatchObject({ type: 'each_progress', current: 3, total: 3 });
  });

  it('does not crash when onEvent is not provided (backwards compat)', async () => {
    const workflow = loadWorkflow('echo');
    const tools = new MockToolAdapter();
    const llm = new MockLLMAdapter();

    // No onEvent — should run normally without throwing
    const log = await runWorkflow({
      workflow,
      inputs: { message: 'hello' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'echo',
    });

    expect(log.status).toBe('success');
  });

  it('includes tokens in step_complete for LLM steps', async () => {
    const workflow = loadWorkflow('llm-judgment');
    const tools = new MockToolAdapter();
    tools.register('gmail_fetch', () => ({
      output: { messages: [{ from: 'alice@example.com', subject: 'Hi', body: 'Hello' }] },
    }));
    const llm = new MockLLMAdapter((_model, _prompt) => ({
      text: JSON.stringify([{ score: 5, summary: 'Normal email' }]),
      tokens: { input: 20, output: 10 },
    }));
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { account: 'test@example.com' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'llm-judgment',
      onEvent: (e) => events.push(e),
    });

    const llmComplete = events.find(
      (e) => e.type === 'step_complete' && e.stepId === 'score',
    );
    expect(llmComplete).toBeDefined();
    if (llmComplete?.type === 'step_complete') {
      expect(llmComplete.tokens).toEqual({ input: 20, output: 10 });
    }
  });

  it('includes iterations in step_complete for each steps', async () => {
    const workflow = loadWorkflow('each-loop');
    const tools = new MockToolAdapter();
    tools.register('get_documents', () => ({
      output: {
        documents: [
          { id: 1, content: 'First' },
          { id: 2, content: 'Second' },
        ],
      },
    }));
    const llm = new MockLLMAdapter((_model, _prompt) => ({
      text: 'summary',
      tokens: { input: 5, output: 3 },
    }));
    const events: RuntimeEvent[] = [];

    await runWorkflow({
      workflow,
      inputs: { items: ['doc1', 'doc2'] },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'each-loop',
      onEvent: (e) => events.push(e),
    });

    const eachComplete = events.find(
      (e) => e.type === 'step_complete' && e.stepId === 'summarize',
    );
    expect(eachComplete).toBeDefined();
    if (eachComplete?.type === 'step_complete') {
      expect(eachComplete.iterations).toBe(2);
    }
  });
});
