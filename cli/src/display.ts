// display.ts — colored onEvent handler for CLI output (writes to stderr).

import pc from 'picocolors';
import type { RuntimeEvent, RunSummary } from 'workflowskill';

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Strip ANSI escape codes to calculate visual width for \r padding. */
function visualLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function createEventHandler(): (event: RuntimeEvent) => void {
  // Per-step state reset on step_start
  let hadSubEvents = false;
  let bufferedError: string | undefined;
  let currentStepLabel = '';
  let lastLineLength = 0;

  function stepLabel(stepId: string, description: string | undefined): string {
    if (description) return `${stepId} ${pc.dim('\u2014')} ${description}`;
    return stepId;
  }

  return function onEvent(event: RuntimeEvent): void {
    switch (event.type) {
      case 'workflow_start':
        process.stderr.write(
          `\n  ${pc.cyan(event.workflow)} ${pc.dim(`(${event.totalSteps} step${event.totalSteps === 1 ? '' : 's'})`)}\n\n`,
        );
        break;

      case 'step_start': {
        hadSubEvents = false;
        bufferedError = undefined;
        const label = stepLabel(event.stepId, event.description);
        currentStepLabel = label;
        const line = `  ${pc.dim('\u00b7')} ${label}`;
        lastLineLength = visualLength(line);
        process.stderr.write(line);
        break;
      }

      case 'step_complete': {
        const dur = formatMs(event.duration_ms);
        const iterSuffix = event.iterations !== undefined ? pc.dim(` \u00d7${event.iterations}`) : '';
        if (hadSubEvents) {
          // Sub-events already printed; write result on its own indented line
          if (event.status === 'success') {
            process.stderr.write(`    ${pc.green('\u2713')} ${pc.dim(dur)}${iterSuffix}\n\n`);
          } else {
            const errPart = bufferedError ? `${pc.dim(bufferedError)}  ` : '';
            process.stderr.write(`    ${pc.red('\u2717')} ${errPart}${pc.dim(dur)}${iterSuffix}\n\n`);
          }
        } else {
          // Overwrite the step_start line using \r
          if (event.status === 'success') {
            const line = `  ${pc.green('\u2713')} ${currentStepLabel}  ${pc.dim(dur)}${iterSuffix}`;
            const pad = Math.max(0, lastLineLength - visualLength(line));
            process.stderr.write(`\r${line}${' '.repeat(pad)}\n\n`);
          } else {
            const errPart = bufferedError ? `${pc.dim(bufferedError)}  ` : '';
            const line = `  ${pc.red('\u2717')} ${currentStepLabel}  ${errPart}${pc.dim(dur)}${iterSuffix}`;
            const pad = Math.max(0, lastLineLength - visualLength(line));
            process.stderr.write(`\r${line}${' '.repeat(pad)}\n\n`);
          }
        }
        break;
      }

      case 'step_skip': {
        const label = stepLabel(event.stepId, event.description);
        process.stderr.write(`  ${pc.dim('\u25cb')} ${pc.dim(label)}\n\n`);
        break;
      }

      case 'step_retry': {
        if (!hadSubEvents) {
          // Close the start line before printing sub-events
          process.stderr.write('\n');
          hadSubEvents = true;
        }
        process.stderr.write(
          `    ${pc.yellow('\u21ba')} retry ${event.attempt}: ${pc.dim(event.error)}\n`,
        );
        break;
      }

      case 'step_error': {
        if (!hadSubEvents) {
          process.stderr.write('\n');
          hadSubEvents = true;
        }
        // Buffer the error message — it will be shown on the step_complete line
        bufferedError = event.error;
        break;
      }

      case 'each_progress': {
        const label = `  ${pc.dim('\u00b7')} ${currentStepLabel}  ${pc.dim(`[${event.current}/${event.total}]`)}`;
        const pad = Math.max(0, lastLineLength - visualLength(label));
        process.stderr.write(`\r${label}${' '.repeat(pad)}`);
        lastLineLength = visualLength(label);
        break;
      }

      case 'workflow_complete': {
        const { status, duration_ms, summary } = event;
        const dur = formatMs(duration_ms);
        const { steps_executed, steps_skipped } = summary as RunSummary;
        if (status === 'success') {
          if (steps_skipped > 0) {
            process.stderr.write(
              `  ${pc.green('Done')} ${pc.dim(`in ${dur}`)} ${pc.dim(`\u2014 ${steps_executed} ran, ${steps_skipped} skipped`)}\n\n`,
            );
          } else {
            process.stderr.write(`  ${pc.green('Done')} ${pc.dim(`in ${dur}`)}\n\n`);
          }
        } else {
          if (steps_skipped > 0) {
            process.stderr.write(
              `  ${pc.red('Failed')} ${pc.dim(`in ${dur}`)} ${pc.dim(`\u2014 ${steps_executed} ran, ${steps_skipped} skipped`)}\n\n`,
            );
          } else {
            process.stderr.write(`  ${pc.red('Failed')} ${pc.dim(`in ${dur}`)}\n\n`);
          }
        }
        break;
      }
    }
  };
}
