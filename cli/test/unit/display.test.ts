import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventHandler } from '../../src/display.js';

describe('createEventHandler', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits workflow_start with name and step count', () => {
    const handler = createEventHandler();
    handler({ type: 'workflow_start', workflow: 'my-workflow', totalSteps: 3 });
    expect(output).toContain('my-workflow');
    expect(output).toContain('3 steps');
  });

  it('emits step_start without newline', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool', tool: 'web_fetch' });
    expect(output).toContain('fetch');
    expect(output).not.toMatch(/\n$/);
  });

  it('shows description with em-dash separator', () => {
    const handler = createEventHandler();
    handler({
      type: 'step_start',
      stepId: 'generate',
      stepType: 'tool',
      tool: 'llm',
      description: 'Generate a haiku',
    });
    expect(output).toContain('generate');
    expect(output).toContain('Generate a haiku');
    expect(output).toContain('\u2014');
  });

  it('shows step without description (no em-dash)', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'greet', stepType: 'transform' });
    expect(output).toContain('greet');
    expect(output).not.toContain('\u2014');
  });

  it('emits step_complete with checkmark on success', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool', tool: 'web_fetch' });
    output = '';
    handler({ type: 'step_complete', stepId: 'fetch', status: 'success', duration_ms: 1200 });
    expect(output).toContain('\u2713');
    expect(output).toContain('1.2s');
    expect(output).toContain('\r');
  });

  it('emits step_complete with cross on failure', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool' });
    output = '';
    handler({ type: 'step_complete', stepId: 'fetch', status: 'failed', duration_ms: 100 });
    expect(output).toContain('\u2717');
    expect(output).toContain('100ms');
  });

  it('emits step_skip with circle symbol', () => {
    const handler = createEventHandler();
    handler({ type: 'step_skip', stepId: 'optional', reason: 'Guard condition evaluated to false' });
    expect(output).toContain('optional');
    expect(output).toContain('\u25cb');
  });

  it('emits step_retry with arrow symbol and error', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool' });
    output = '';
    handler({ type: 'step_retry', stepId: 'fetch', attempt: 1, error: 'timeout' });
    expect(output).toContain('\u21ba');
    expect(output).toContain('retry 1');
    expect(output).toContain('timeout');
  });

  it('buffers step_error and shows it on step_complete line', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool' });
    handler({ type: 'step_error', stepId: 'fetch', error: 'connection refused', onError: 'fail' });
    output = '';
    handler({ type: 'step_complete', stepId: 'fetch', status: 'failed', duration_ms: 200 });
    expect(output).toContain('connection refused');
    expect(output).toContain('\u2717');
  });

  it('retry then success: result on own indented line', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'fetch', stepType: 'tool' });
    handler({ type: 'step_retry', stepId: 'fetch', attempt: 1, error: 'timeout' });
    output = '';
    handler({ type: 'step_complete', stepId: 'fetch', status: 'success', duration_ms: 3000 });
    // Should write result on indented line (4 spaces), not \r overwrite
    expect(output).toContain('    ');
    expect(output).toContain('\u2713');
    expect(output).toContain('3.0s');
    expect(output).not.toContain('\r');
  });

  it('emits workflow_complete Done (no skips)', () => {
    const handler = createEventHandler();
    handler({
      type: 'workflow_complete',
      status: 'success',
      duration_ms: 4600,
      summary: { steps_executed: 3, steps_skipped: 0, total_duration_ms: 4600 },
    });
    expect(output).toContain('Done');
    expect(output).toContain('4.6s');
    expect(output).not.toContain('skipped');
  });

  it('emits workflow_complete Done with skip count when skips > 0', () => {
    const handler = createEventHandler();
    handler({
      type: 'workflow_complete',
      status: 'success',
      duration_ms: 1000,
      summary: { steps_executed: 2, steps_skipped: 1, total_duration_ms: 1000 },
    });
    expect(output).toContain('Done');
    expect(output).toContain('2 ran');
    expect(output).toContain('1 skipped');
  });

  it('emits workflow_complete Failed', () => {
    const handler = createEventHandler();
    handler({
      type: 'workflow_complete',
      status: 'failed',
      duration_ms: 200,
      summary: { steps_executed: 1, steps_skipped: 2, total_duration_ms: 200 },
    });
    expect(output).toContain('Failed');
    expect(output).toContain('1 ran');
    expect(output).toContain('2 skipped');
  });

  it('emits each_progress with carriage return', () => {
    const handler = createEventHandler();
    handler({ type: 'step_start', stepId: 'loop', stepType: 'tool' });
    output = '';
    handler({ type: 'each_progress', stepId: 'loop', current: 2, total: 5 });
    expect(output).toContain('\r');
    expect(output).toContain('2/5');
  });

  it('writes to stderr not stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const handler = createEventHandler();
    handler({ type: 'workflow_start', workflow: 'test', totalSteps: 1 });
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
