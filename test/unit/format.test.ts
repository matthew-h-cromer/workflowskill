import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderEvent, resetFormatState } from '../../src/cli/format.js';

describe('renderEvent', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resetFormatState();
  });

  afterEach(() => {
    stderrWrite.mockRestore();
  });

  it('writes text_delta directly to stderr', () => {
    renderEvent({ type: 'text_delta', delta: 'hello' });
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite.mock.calls[0]![0]).toBe('hello');
  });

  it('writes thinking_delta as dimmed text', () => {
    renderEvent({ type: 'thinking_delta', delta: 'thinking...' });
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    const output = stderrWrite.mock.calls[0]![0] as string;
    expect(output).toContain('thinking...');
  });

  it('writes a newline for stream_start when no trailing blank', () => {
    renderEvent({ type: 'stream_start' });
    expect(stderrWrite).toHaveBeenCalledWith('\n');
  });

  it('writes newline for stream_end when mid-stream', () => {
    renderEvent({ type: 'text_delta', delta: 'some text' });
    stderrWrite.mockClear();
    renderEvent({ type: 'stream_end' });
    expect(stderrWrite).toHaveBeenCalledWith('\n');
  });

  it('writes nothing for stream_end when not mid-stream', () => {
    renderEvent({ type: 'stream_end' });
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('formats tool_call with name and args on its own line', () => {
    renderEvent({ type: 'tool_call', name: 'web_search', args: { query: 'react hooks' } });
    const allOutput = stderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(allOutput).toContain('web_search');
    expect(allOutput).toContain('query=');
  });

  it('ends streaming text before showing tool_call', () => {
    renderEvent({ type: 'text_delta', delta: 'partial text' });
    stderrWrite.mockClear();
    renderEvent({ type: 'tool_call', name: 'web_fetch', args: {} });
    const calls = stderrWrite.mock.calls.map((c: unknown[]) => c[0] as string);
    // First call should be a newline to end the stream
    expect(calls[0]).toBe('\n');
    // Subsequent output should contain the tool name
    expect(calls.join('')).toContain('web_fetch');
  });

  it('formats tool_result success with checkmark', () => {
    renderEvent({ type: 'tool_result', name: 'web_search', output: 'Found 5 results', isError: false });
    const output = stderrWrite.mock.calls[0]![0] as string;
    expect(output).toContain('✓');
    expect(output).toContain('Found 5 results');
  });

  it('formats tool_result errors with X mark', () => {
    renderEvent({ type: 'tool_result', name: 'web_fetch', output: 'timeout', isError: true });
    const output = stderrWrite.mock.calls[0]![0] as string;
    expect(output).toContain('✗');
    expect(output).toContain('timeout');
  });

  it('truncates long tool_result output', () => {
    const longOutput = 'x'.repeat(300);
    renderEvent({ type: 'tool_result', name: 'web_fetch', output: longOutput, isError: false });
    const output = stderrWrite.mock.calls[0]![0] as string;
    expect(output).toContain('…');
    expect(output.length).toBeLessThan(longOutput.length);
  });

  it('writes assistant_message with leading newline', () => {
    renderEvent({ type: 'assistant_message', text: 'What kind of workflow?' });
    const allOutput = stderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(allOutput).toContain('What kind of workflow?');
    // Should have a leading newline for spacing
    expect(allOutput.startsWith('\n')).toBe(true);
  });

  it('writes dim text for generating event', () => {
    renderEvent({ type: 'generating' });
    const allOutput = stderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(allOutput).toContain('Generating workflow...');
  });

  it('does nothing for workflow_generated (handled externally)', () => {
    renderEvent({
      type: 'workflow_generated',
      content: '---\n---',
      valid: true,
      errors: [],
    });
    expect(stderrWrite).not.toHaveBeenCalled();
  });
});
