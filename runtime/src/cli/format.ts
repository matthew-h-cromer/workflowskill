// CLI formatting module — runtime event rendering.
// Uses picocolors for terminal colors and writes to stderr (keeping stdout clean for output).

import pc from 'picocolors';
import type { RuntimeEvent } from '../types/index.js';

// ─── Runtime event renderer ───────────────────────────────────────────────────

// Track in-progress step names for the "running..." line (keyed by stepId).
const runtimeActiveSteps = new Map<string, string>();

// Whether stderr is a real TTY (enables in-place cursor movement).
const isTTY = !!process.stderr.isTTY;

// ANSI helpers for in-place line updates (only used when isTTY is true).
const MOVE_UP = (n: number): string => `\x1b[${n}A`;
const CLEAR_LINE = '\x1b[2K\r';
const MOVE_DOWN = (n: number): string => `\x1b[${n}B`;

// Lines printed between step_start and step_complete (retries, each_progress).
let linesSinceStepStart = 0;
// Whether each_progress has been printed at least once for the current step.
let hasEachProgress = false;

/**
 * Render a runtime event to stderr with live step-by-step progress output.
 * All CLI live output goes to stderr; stdout is reserved for the JSON run log.
 *
 * On TTY: the yellow "running..." line is overwritten in-place by the green/red
 * completion line, and each_progress updates a single line instead of appending.
 * On non-TTY (pipes, files): append-only fallback — existing behavior.
 */
export function renderRuntimeEvent(event: RuntimeEvent): void {
  switch (event.type) {
    case 'workflow_start':
      process.stderr.write(`\n${pc.bold('▶')} Running ${pc.cyan(event.workflow)} (${event.totalSteps} step${event.totalSteps !== 1 ? 's' : ''})\n\n`);
      break;

    case 'step_start': {
      linesSinceStepStart = 0;
      hasEachProgress = false;
      const typeLabel = event.tool ? `[tool] (${event.tool})` : `[${event.stepType}]`;
      const line = `  ${pc.yellow('●')} ${event.stepId} ${pc.dim(typeLabel)} ${pc.dim('running...')}`;
      runtimeActiveSteps.set(event.stepId, line);
      process.stderr.write(line + '\n');
      break;
    }

    case 'step_complete': {
      runtimeActiveSteps.delete(event.stepId);
      const durationStr = formatDuration(event.duration_ms);
      const extras: string[] = [];
      if (event.tokens) extras.push(`${event.tokens.input + event.tokens.output} tokens`);
      if (event.iterations !== undefined) extras.push(`${event.iterations} iterations`);
      const extraStr = extras.length > 0 ? pc.dim(` (${extras.join(', ')})`) : '';
      const completionLine =
        event.status === 'success'
          ? `  ${pc.green('✓')} ${event.stepId} ${pc.dim(durationStr)}${extraStr}`
          : `  ${pc.red('✗')} ${event.stepId} ${pc.dim(durationStr)} ${pc.red('failed')}${extraStr}`;

      if (isTTY) {
        // Move up past any intermediate lines + the "running..." line, overwrite it,
        // then move the cursor back down past the intermediate lines.
        const up = linesSinceStepStart + 1;
        process.stderr.write(
          MOVE_UP(up) + CLEAR_LINE + completionLine + '\n' +
          (linesSinceStepStart > 0 ? MOVE_DOWN(linesSinceStepStart) : ''),
        );
      } else {
        process.stderr.write(completionLine + '\n');
      }
      break;
    }

    case 'step_skip':
      runtimeActiveSteps.delete(event.stepId);
      process.stderr.write(`  ${pc.dim('○')} ${pc.dim(event.stepId)} ${pc.dim('skipped')}: ${pc.dim(event.reason)}\n`);
      break;

    case 'step_retry':
      process.stderr.write(`  ${pc.yellow('↻')} ${event.stepId} retry #${event.attempt}: ${pc.dim(event.error)}\n`);
      linesSinceStepStart++;
      break;

    case 'step_error':
      process.stderr.write(`  ${pc.red('✗')} ${event.stepId} error (${event.onError}): ${pc.dim(event.error)}\n`);
      linesSinceStepStart++;
      break;

    case 'each_progress':
      if (isTTY && hasEachProgress) {
        // Overwrite the previous each_progress line in-place.
        process.stderr.write(MOVE_UP(1) + CLEAR_LINE + `    ${pc.dim(`${event.current}/${event.total}`)}\n`);
      } else {
        process.stderr.write(`    ${pc.dim(`${event.current}/${event.total}`)}\n`);
        linesSinceStepStart++;
        hasEachProgress = true;
      }
      break;

    case 'workflow_complete': {
      const durationStr = formatDuration(event.duration_ms);
      const { steps_executed, steps_skipped, total_tokens } = event.summary;
      const parts: string[] = [`${steps_executed} executed`];
      if (steps_skipped > 0) parts.push(`${steps_skipped} skipped`);
      if (total_tokens > 0) parts.push(`${total_tokens} tokens`);
      const summary = parts.join(', ');
      if (event.status === 'success') {
        process.stderr.write(`\n${pc.green(pc.bold('✓'))} ${pc.green('Success')} in ${durationStr} ${pc.dim(`(${summary})`)}\n`);
      } else {
        process.stderr.write(`\n${pc.red(pc.bold('✗'))} ${pc.red('Failed')} in ${durationStr} ${pc.dim(`(${summary})`)}\n`);
      }
      break;
    }
  }
}

/** Reset runtime format state (for testing). */
export function resetRuntimeFormatState(): void {
  runtimeActiveSteps.clear();
  linesSinceStepStart = 0;
  hasEachProgress = false;
}

/** Format a duration in milliseconds as a human-readable string (e.g. "1.2s", "2m30s"). */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m${seconds}s`;
}
