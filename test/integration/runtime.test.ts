import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflowFromMd } from '../../src/parser/index.js';
import { runWorkflow } from '../../src/runtime/index.js';
import { WorkflowExecutionError } from '../../src/runtime/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';

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
        text: JSON.stringify({ scored: [{ score: 8, summary: 'Urgent email' }] }),
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

    // failing_tool should be recorded as failed
    const failingRecord = log.steps.find((s) => s.id === 'failing_tool')!;
    expect(failingRecord.status).toBe('failed');
    expect(failingRecord.error).toBe('Connection refused');

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

    // failing_tool recorded as failed but workflow continues
    const failingRecord = log.steps.find((s) => s.id === 'failing_tool')!;
    expect(failingRecord.status).toBe('failed');
    expect(failingRecord.error).toBe('Service unavailable');

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
    expect(record.error).toBe('Permanent failure');
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
  it('has all required fields per RFC', async () => {
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

  it('rejects invalid workflow before execution', async () => {
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

    await expect(
      runWorkflow({
        workflow,
        toolAdapter: tools,
        llmAdapter: llm,
      }),
    ).rejects.toThrow(WorkflowExecutionError);
  });
});

// ─── 11. output-source ──────────────────────────────────────────────────────

describe('output-source workflow', () => {
  it('maps step output via $output and workflow output via $steps', async () => {
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

    // Step output should be mapped via $output.body.title and $output.body.userId
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
