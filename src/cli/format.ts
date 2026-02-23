// CLI formatting module — Claude Code-style rendering for conversation events.
// Uses picocolors for terminal colors and writes to stderr (keeping stdout clean for output).

import pc from 'picocolors';
import type { ConversationEvent } from '../generator/conversation.js';

// Track whether we're mid-stream (text is being written without a trailing newline).
let midStream = false;
// Track whether the last output ended with spacing (to avoid double blank lines).
let trailingBlank = false;

/**
 * Render a conversation event to stderr with Claude Code-style formatting.
 *
 * Layout principles:
 * - Tool calls get their own visual block with a blank line before/after
 * - Streamed text flows naturally, but is visually separated from tool blocks
 * - Assistant messages are padded with newlines for readability
 * - Everything uses consistent indentation
 */
export function renderEvent(event: ConversationEvent): void {
  switch (event.type) {
    case 'text_delta':
      midStream = true;
      trailingBlank = false;
      process.stderr.write(event.delta);
      break;

    case 'thinking_delta':
      midStream = true;
      trailingBlank = false;
      process.stderr.write(pc.dim(event.delta));
      break;

    case 'stream_start':
      if (!trailingBlank) {
        process.stderr.write('\n');
        trailingBlank = true;
      }
      break;

    case 'stream_end':
      if (midStream) {
        process.stderr.write('\n');
        midStream = false;
      }
      trailingBlank = false;
      break;

    case 'tool_call': {
      // End any in-progress streaming text before showing tool call
      if (midStream) {
        process.stderr.write('\n');
        midStream = false;
      }
      const argsPreview = formatArgs(event.args);
      const argStr = argsPreview ? `  ${pc.dim(argsPreview)}` : '';
      if (!trailingBlank) {
        process.stderr.write('\n');
      }
      process.stderr.write(`  ${pc.bold(pc.cyan('⚡ ' + event.name))}${argStr}\n`);
      trailingBlank = false;
      break;
    }

    case 'tool_result':
      if (event.isError) {
        process.stderr.write(`  ${pc.red('✗')} ${pc.red(truncate(event.output, 200))}\n`);
      } else {
        process.stderr.write(`  ${pc.dim(pc.green('✓'))} ${pc.dim(truncate(event.output, 200))}\n`);
      }
      trailingBlank = false;
      break;

    case 'assistant_message':
      if (!trailingBlank) {
        process.stderr.write('\n');
      }
      process.stderr.write(`${event.text}\n`);
      trailingBlank = false;
      break;

    case 'generating':
      if (midStream) {
        process.stderr.write('\n');
        midStream = false;
      }
      if (!trailingBlank) {
        process.stderr.write('\n');
      }
      process.stderr.write(`${pc.dim('Generating workflow...')}\n`);
      trailingBlank = false;
      break;

    case 'workflow_generated':
      // Handled externally in generate.ts (file write logic)
      break;
  }
}

/** Reset internal state (for testing). */
export function resetFormatState(): void {
  midStream = false;
  trailingBlank = false;
}

/** Format tool args as a compact preview string. */
function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${pc.white('"' + truncate(val, 60) + '"')}`;
    })
    .join(' ');
}

/** Truncate a string with ellipsis. */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
