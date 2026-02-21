import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflowFromMd } from '../../src/parser/index.js';
import { runWorkflow } from '../../src/runtime/index.js';
import { MockToolAdapter } from '../../src/adapters/mock-tool-adapter.js';
import { MockLLMAdapter } from '../../src/adapters/mock-llm-adapter.js';

const FIXTURES = join(import.meta.dirname, '../fixtures');

function loadWorkflow(name: string) {
  const content = readFileSync(join(FIXTURES, `${name}.md`), 'utf-8');
  return parseWorkflowFromMd(content);
}

// ─── Graduation Test 1: Email Triage ────────────────────────────────────────

describe('graduation: email triage', () => {
  function setupEmailTriage() {
    const workflow = loadWorkflow('graduation-email-triage');
    const tools = new MockToolAdapter();

    tools.register('gmail.search', () => ({
      output: {
        messages: [
          { from: 'boss@company.com', subject: 'Q4 Review - Urgent', body: 'Need your input by EOD' },
          { from: 'newsletter@spam.com', subject: 'Weekly deals', body: 'Check out our offers' },
          { from: 'cto@company.com', subject: 'Production incident', body: 'Database is down' },
          { from: 'hr@company.com', subject: 'Team lunch Friday', body: 'Pizza or sushi?' },
        ],
      },
    }));

    tools.register('slack.post_message', () => ({
      output: { ok: true },
    }));

    return { workflow, tools };
  }

  it('scores, filters, sorts, and posts briefing', async () => {
    const { workflow, tools } = setupEmailTriage();

    const llm = new MockLLMAdapter((_model, prompt) => {
      // Score based on keywords in prompt
      let score = 3;
      if (prompt.includes('Urgent') || prompt.includes('incident')) score = 9;
      if (prompt.includes('deals') || prompt.includes('spam')) score = 1;
      if (prompt.includes('lunch')) score = 4;

      return {
        text: JSON.stringify({ score, summary: `Priority: ${score}` }),
        tokens: { input: 50, output: 20 },
      };
    });

    const log = await runWorkflow({
      workflow,
      inputs: { max_results: 20, min_score: 7 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'email-triage',
    });

    expect(log.status).toBe('success');

    // score_emails: each iteration over 4 emails
    const scoreRecord = log.steps.find((s) => s.id === 'score_emails')!;
    expect(scoreRecord.iterations).toBe(4);
    expect(scoreRecord.tokens!.input).toBe(200); // 50 * 4
    expect(scoreRecord.tokens!.output).toBe(80); // 20 * 4

    // filter_important: only high scores kept (score >= 7)
    const filterRecord = log.steps.find((s) => s.id === 'filter_important')!;
    expect(filterRecord.status).toBe('success');
    const filtered = (filterRecord.output as Record<string, unknown>).items as unknown[];
    expect(filtered.length).toBe(2); // boss + cto

    // sort_by_score: sorted desc
    const sortRecord = log.steps.find((s) => s.id === 'sort_by_score')!;
    expect(sortRecord.status).toBe('success');

    // exit_if_none: should be skipped (there ARE important emails)
    const exitRecord = log.steps.find((s) => s.id === 'exit_if_none')!;
    expect(exitRecord.status).toBe('skipped');

    // format_briefing + send_briefing: executed
    expect(log.steps.find((s) => s.id === 'format_briefing')!.status).toBe('success');
    expect(log.steps.find((s) => s.id === 'send_briefing')!.status).toBe('success');

    expect(log.summary.total_tokens).toBe(280);
  });

  it('exits early when no important emails', async () => {
    const { workflow, tools } = setupEmailTriage();

    // All scores below threshold
    const llm = new MockLLMAdapter(() => ({
      text: JSON.stringify({ score: 2, summary: 'Low priority' }),
      tokens: { input: 50, output: 20 },
    }));

    const log = await runWorkflow({
      workflow,
      inputs: { max_results: 20, min_score: 7 },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'email-triage',
    });

    expect(log.status).toBe('success');

    // exit_if_none should trigger (filtered list is empty after filter, sorted list is empty)
    const exitRecord = log.steps.find((s) => s.id === 'exit_if_none')!;
    expect(exitRecord.status).toBe('success');

    // format_briefing and send_briefing should be skipped
    const formatRecord = log.steps.find((s) => s.id === 'format_briefing');
    const sendRecord = log.steps.find((s) => s.id === 'send_briefing');
    expect(formatRecord!.status).toBe('skipped');
    expect(sendRecord!.status).toBe('skipped');
  });
});

// ─── Graduation Test 2: Deployment Report (Zero Tokens) ────────────────────

describe('graduation: deployment report', () => {
  function setupDeployReport() {
    const workflow = loadWorkflow('graduation-deploy-report');
    const tools = new MockToolAdapter();

    tools.register('github.list_deployments', () => ({
      output: {
        deployments: [
          {
            environment: 'production',
            sha: 'abc123',
            state: 'success',
            created_at: '2026-02-20T14:00:00Z',
            repository: { name: 'web-app' },
            creator: { login: 'alice' },
          },
          {
            environment: 'staging',
            sha: 'def456',
            state: 'success',
            created_at: '2026-02-20T15:00:00Z',
            repository: { name: 'web-app' },
            creator: { login: 'bob' },
          },
          {
            environment: 'production',
            sha: 'ghi789',
            state: 'failure',
            created_at: '2026-02-20T16:00:00Z',
            repository: { name: 'api-server' },
            creator: { login: 'charlie' },
          },
        ],
      },
    }));

    tools.register('slack.post_message', () => ({
      output: { ok: true },
    }));

    return { workflow, tools };
  }

  it('filters, sorts, formats — zero tokens', async () => {
    const { workflow, tools } = setupDeployReport();
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { repo: 'my-org/web-app' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'deploy-report',
    });

    expect(log.status).toBe('success');
    expect(log.summary.total_tokens).toBe(0); // Zero LLM tokens!

    // filter_production: only 2 production deployments
    const filterRecord = log.steps.find((s) => s.id === 'filter_production')!;
    const filtered = (filterRecord.output as Record<string, unknown>).items as unknown[];
    expect(filtered.length).toBe(2);

    // exit_if_none: skipped (there are production deploys)
    const exitRecord = log.steps.find((s) => s.id === 'exit_if_none')!;
    expect(exitRecord.status).toBe('skipped');

    // sort_recent: most recent first (ghi789 at 16:00 before abc123 at 14:00)
    const sortRecord = log.steps.find((s) => s.id === 'sort_recent')!;
    const sorted = (sortRecord.output as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect(sorted[0]!.created_at).toBe('2026-02-20T16:00:00Z');

    // format_report: mapped fields
    const formatRecord = log.steps.find((s) => s.id === 'format_report')!;
    const formatted = (formatRecord.output as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect(formatted[0]!.repo).toBe('api-server');
    expect(formatted[0]!.author).toBe('charlie');
    expect(formatted[0]!.sha).toBe('ghi789');

    // post_to_slack: executed
    expect(log.steps.find((s) => s.id === 'post_to_slack')!.status).toBe('success');
  });

  it('exits early when no production deployments', async () => {
    const workflow = loadWorkflow('graduation-deploy-report');
    const tools = new MockToolAdapter();
    tools.register('github.list_deployments', () => ({
      output: {
        deployments: [
          { environment: 'staging', sha: 'abc', state: 'success', created_at: '2026-02-20T14:00:00Z', repository: { name: 'web-app' }, creator: { login: 'alice' } },
        ],
      },
    }));
    tools.register('slack.post_message', () => ({ output: { ok: true } }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { repo: 'my-org/web-app' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'deploy-report',
    });

    expect(log.status).toBe('success');
    const exitRecord = log.steps.find((s) => s.id === 'exit_if_none')!;
    expect(exitRecord.status).toBe('success');
    expect(exitRecord.output).toEqual({ count: 0, deployments: [] });
  });
});

// ─── Graduation Test 3: Content Moderation ──────────────────────────────────

describe('graduation: content moderation', () => {
  function setupContentModeration() {
    const workflow = loadWorkflow('graduation-content-moderation');
    const tools = new MockToolAdapter();

    tools.register('community.list_recent_posts', () => ({
      output: {
        posts: [
          { id: 'p1', author: 'alice', body: 'Great article!' },
          { id: 'p2', author: 'troll', body: 'You are all terrible people' },
          { id: 'p3', author: 'spammer', body: 'Buy cheap watches at...' },
          { id: 'p4', author: 'bob', body: 'Has anyone seen this bug?' },
        ],
      },
    }));

    tools.register('community.remove_posts', () => ({
      output: { removed: true },
    }));

    tools.register('slack.post_message', () => ({
      output: { ok: true },
    }));

    tools.register('community.queue_review', () => ({
      output: { queued: true },
    }));

    return { workflow, tools };
  }

  it('routes high-severity violations to auto-remove + urgent alert', async () => {
    const { workflow, tools } = setupContentModeration();

    const llm = new MockLLMAdapter((_model, prompt) => {
      if (prompt.includes('terrible people')) {
        return {
          text: JSON.stringify({ post_id: 'p2', severity: 'high', reason: 'harassment' }),
          tokens: { input: 30, output: 15 },
        };
      }
      if (prompt.includes('cheap watches')) {
        return {
          text: JSON.stringify({ post_id: 'p3', severity: 'low', reason: 'spam' }),
          tokens: { input: 30, output: 15 },
        };
      }
      return {
        text: JSON.stringify({ post_id: prompt.match(/p\d/)?.[0] ?? 'unknown', severity: 'none', reason: '' }),
        tokens: { input: 30, output: 15 },
      };
    });

    const log = await runWorkflow({
      workflow,
      inputs: { channel_id: 'general' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'content-moderation',
    });

    expect(log.status).toBe('success');

    // evaluate_posts: 4 iterations
    const evalRecord = log.steps.find((s) => s.id === 'evaluate_posts')!;
    expect(evalRecord.iterations).toBe(4);

    // filter_violations: keeps 2 (high + low)
    const violationsRecord = log.steps.find((s) => s.id === 'filter_violations')!;
    const violations = (violationsRecord.output as Record<string, unknown>).items as unknown[];
    expect(violations.length).toBe(2);

    // exit_if_clean: skipped (there are violations)
    const exitCleanRecord = log.steps.find((s) => s.id === 'exit_if_clean')!;
    expect(exitCleanRecord.status).toBe('skipped');

    // filter_high_severity: 1 (harassment)
    const highRecord = log.steps.find((s) => s.id === 'filter_high_severity')!;
    const highItems = (highRecord.output as Record<string, unknown>).items as unknown[];
    expect(highItems.length).toBe(1);

    // route_by_severity: takes then branch (high severity exists)
    const routeRecord = log.steps.find((s) => s.id === 'route_by_severity')!;
    expect(routeRecord.status).toBe('success');

    // auto_remove: executed (in then branch)
    const removeRecord = log.steps.find((s) => s.id === 'auto_remove')!;
    expect(removeRecord.status).toBe('success');
    expect(removeRecord.iterations).toBe(1);

    // send_urgent_alert: executed (in then branch)
    expect(log.steps.find((s) => s.id === 'send_urgent_alert')!.status).toBe('success');

    // send_summary: skipped (else branch not selected)
    expect(log.steps.find((s) => s.id === 'send_summary')!.status).toBe('skipped');

    // queue_for_review: executed (guard condition true, low severity exists)
    const queueRecord = log.steps.find((s) => s.id === 'queue_for_review')!;
    expect(queueRecord.status).toBe('success');
    expect(queueRecord.iterations).toBe(1);
  });

  it('routes low-severity only to summary + review queue', async () => {
    const { workflow, tools } = setupContentModeration();

    // Only low severity violations, no high
    const llm = new MockLLMAdapter((_model, prompt) => {
      if (prompt.includes('cheap watches')) {
        return {
          text: JSON.stringify({ post_id: 'p3', severity: 'low', reason: 'spam' }),
          tokens: { input: 30, output: 15 },
        };
      }
      return {
        text: JSON.stringify({ post_id: 'unknown', severity: 'none', reason: '' }),
        tokens: { input: 30, output: 15 },
      };
    });

    const log = await runWorkflow({
      workflow,
      inputs: { channel_id: 'general' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'content-moderation',
    });

    expect(log.status).toBe('success');

    // route_by_severity: takes else branch (no high severity)
    const routeRecord = log.steps.find((s) => s.id === 'route_by_severity')!;
    expect(routeRecord.status).toBe('success');

    // auto_remove: skipped (then branch not selected)
    expect(log.steps.find((s) => s.id === 'auto_remove')!.status).toBe('skipped');
    expect(log.steps.find((s) => s.id === 'send_urgent_alert')!.status).toBe('skipped');

    // send_summary: executed (else branch)
    expect(log.steps.find((s) => s.id === 'send_summary')!.status).toBe('success');

    // queue_for_review: executed (low severity exists)
    const queueRecord = log.steps.find((s) => s.id === 'queue_for_review')!;
    expect(queueRecord.status).toBe('success');
  });

  it('exits early when no posts', async () => {
    const workflow = loadWorkflow('graduation-content-moderation');
    const tools = new MockToolAdapter();
    tools.register('community.list_recent_posts', () => ({
      output: { posts: [] },
    }));
    tools.register('community.remove_posts', () => ({ output: { removed: true } }));
    tools.register('slack.post_message', () => ({ output: { ok: true } }));
    tools.register('community.queue_review', () => ({ output: { queued: true } }));
    const llm = new MockLLMAdapter();

    const log = await runWorkflow({
      workflow,
      inputs: { channel_id: 'general' },
      toolAdapter: tools,
      llmAdapter: llm,
      workflowName: 'content-moderation',
    });

    expect(log.status).toBe('success');
    const exitRecord = log.steps.find((s) => s.id === 'exit_if_none')!;
    expect(exitRecord.status).toBe('success');
    expect(exitRecord.output).toEqual({ evaluated: 0, auto_removed: 0, queued_for_review: 0 });
  });
});
