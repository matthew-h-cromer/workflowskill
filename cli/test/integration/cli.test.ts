import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLI_DIR = resolve(__dirname, '../..');
const CLI_ENTRY = resolve(CLI_DIR, 'src/cli.ts');
const EXAMPLES_DIR = resolve(CLI_DIR, '../examples');
const HELLO_WORLD = join(EXAMPLES_DIR, 'hello-world.md');

function runCli(args: string[], env?: Record<string, string>): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync('node', ['--import', 'tsx/esm', CLI_ENTRY, ...args], {
    encoding: 'utf-8',
    cwd: CLI_DIR,
    env: { ...process.env, ...env, NO_COLOR: '1' },
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

describe('CLI integration', () => {
  it('exits 0 and prints output for hello-world.md', () => {
    const { stdout, exitCode } = runCli(['run', HELLO_WORLD]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Hello, world!');
  });

  it('--output-json produces valid RunLog JSON', () => {
    const { stdout, exitCode } = runCli(['run', HELLO_WORLD, '--output-json']);
    expect(exitCode).toBe(0);
    const log = JSON.parse(stdout) as { status: string; outputs: Record<string, unknown> };
    expect(log.status).toBe('success');
    expect(log.outputs['message']).toBe('Hello, world!');
  });

  it('shows help when no arguments given', () => {
    const { stdout, exitCode } = runCli([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  it('exits 1 for a non-existent file', () => {
    const { exitCode, stderr } = runCli(['run', 'does-not-exist.md']);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/cannot read file/i);
  });

  it('passes --input values into workflow', () => {
    // hello-world has no inputs — just verify the run still succeeds
    const { exitCode } = runCli(['run', HELLO_WORLD, '-i', 'ignored=value']);
    expect(exitCode).toBe(0);
  });

  it('parses --json-input', () => {
    const { exitCode } = runCli(['run', HELLO_WORLD, '--json-input', '{}']);
    expect(exitCode).toBe(0);
  });

  it('exits 1 when --json-input is invalid JSON', () => {
    const { exitCode, stderr } = runCli(['run', HELLO_WORLD, '--json-input', 'not-json']);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/invalid json/i);
  });

  it('display output goes to stderr; workflow output goes to stdout', () => {
    const { stdout, stderr, exitCode } = runCli(['run', HELLO_WORLD]);
    expect(exitCode).toBe(0);
    // Display (workflow name, step progress, Done) is on stderr
    expect(stderr).toContain('hello-world');
    expect(stderr).toContain('Done');
    // Workflow JSON output is on stdout only
    expect(stdout).toContain('Hello, world!');
    expect(stderr).not.toContain('Hello, world!');
  });
});
