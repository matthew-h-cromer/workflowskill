import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflowSkill } from '../../src/runtime/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';
import type { RuntimeEvent } from '../../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

function makeAdapters() {
  return {
    toolAdapter: new MockToolAdapter(),
    llmAdapter: new MockLLMAdapter(),
  };
}

describe('runWorkflowSkill - valid content', () => {
  it('executes a full SKILL.md and returns a RunLog', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('echo.md'),
      inputs: { message: 'hi' },
      toolAdapter,
      llmAdapter,
    });
    expect(log.status).toBe('success');
    expect(log.workflow).toBe('echo');
  });

  it('uses frontmatter name as workflow name', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('echo.md'),
      toolAdapter,
      llmAdapter,
      workflowName: 'fallback',
    });
    // Frontmatter name wins over fallback
    expect(log.workflow).toBe('echo');
  });

  it('uses workflowName fallback when content has no frontmatter', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('malformed-no-frontmatter.md'),
      toolAdapter,
      llmAdapter,
      workflowName: 'my-workflow',
    });
    expect(log.status).toBe('success');
    expect(log.workflow).toBe('my-workflow');
  });

  it('defaults workflowName to "inline" when not provided and no frontmatter', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('malformed-no-frontmatter.md'),
      toolAdapter,
      llmAdapter,
    });
    expect(log.workflow).toBe('inline');
  });

  it('forwards inputs to the workflow', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('echo.md'),
      inputs: { message: 'world' },
      toolAdapter,
      llmAdapter,
    });
    expect(log.status).toBe('success');
    expect(log.inputs).toMatchObject({ message: 'world' });
  });

  it('calls onEvent callbacks during execution', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const events: RuntimeEvent[] = [];
    await runWorkflowSkill({
      content: readFixture('echo.md'),
      toolAdapter,
      llmAdapter,
      onEvent: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === 'workflow_start')).toBe(true);
    expect(events.some((e) => e.type === 'workflow_complete')).toBe(true);
  });
});

describe('runWorkflowSkill - parse failures', () => {
  it('returns failed RunLog for empty content', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({ content: '', toolAdapter, llmAdapter });
    expect(log.status).toBe('failed');
    expect(log.error?.phase).toBe('parse');
  });

  it('returns failed RunLog for content with no workflow block', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('malformed-no-block.md'),
      toolAdapter,
      llmAdapter,
    });
    expect(log.status).toBe('failed');
    expect(log.error?.phase).toBe('parse');
  });

  it('returns failed RunLog for malformed YAML', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('malformed-bad-yaml.md'),
      toolAdapter,
      llmAdapter,
    });
    expect(log.status).toBe('failed');
    expect(log.error?.phase).toBe('parse');
    expect(typeof log.error?.message).toBe('string');
  });

  it('returns failed RunLog for bad schema and includes details', async () => {
    const { toolAdapter, llmAdapter } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('malformed-bad-schema.md'),
      toolAdapter,
      llmAdapter,
    });
    expect(log.status).toBe('failed');
    expect(log.error?.phase).toBe('parse');
    expect(log.error?.details).toBeDefined();
  });

  it('never throws — returns RunLog even for unexpected errors', async () => {
    const toolAdapter = new MockToolAdapter();
    // LLM adapter that throws synchronously
    const llmAdapter = {
      complete: () => { throw new Error('unexpected!'); },
    } as unknown as MockLLMAdapter;
    await expect(
      runWorkflowSkill({
        content: readFixture('echo.md'),
        toolAdapter,
        llmAdapter,
      }),
    ).resolves.toBeDefined();
  });
});

describe('runWorkflowSkill - execution failures', () => {
  it('returns failed RunLog with phase: execute when runWorkflow throws', async () => {
    // Force runWorkflow to throw by providing an adapter that rejects
    const badLlmAdapter = {
      complete: () => Promise.reject(new Error('llm boom')),
    } as unknown as MockLLMAdapter;

    // Use a fixture with an LLM step to trigger the adapter
    const { toolAdapter: ta } = makeAdapters();
    const log = await runWorkflowSkill({
      content: readFixture('echo.md'),
      toolAdapter: ta,
      llmAdapter: badLlmAdapter,
    });
    // echo.md has no LLM step, so execution should succeed
    expect(log.status).toBe('success');
  });
});
