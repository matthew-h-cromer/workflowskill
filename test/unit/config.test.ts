// Tests for src/config/index.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns empty config when no env vars or .env file', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;

    const config = loadConfig('/nonexistent');
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.googleCredentials).toBeUndefined();
  });

  it('reads ANTHROPIC_API_KEY from env var', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-123';
    const config = loadConfig('/nonexistent');
    expect(config.anthropicApiKey).toBe('sk-test-123');
  });

  it('reads Google credentials from env vars', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh-token';

    const config = loadConfig('/nonexistent');
    expect(config.googleCredentials).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
    });
  });

  it('does not set googleCredentials when only partial creds exist', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    // Missing GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN

    const config = loadConfig('/nonexistent');
    expect(config.googleCredentials).toBeUndefined();
  });

  it('reads from .env file', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const tmpDir = mkdtempSync(join(tmpdir(), 'wfskill-'));
    writeFileSync(join(tmpDir, '.env'), 'ANTHROPIC_API_KEY=sk-from-dotenv\n');

    const config = loadConfig(tmpDir);
    expect(config.anthropicApiKey).toBe('sk-from-dotenv');

    rmSync(tmpDir, { recursive: true });
  });

  it('env var takes precedence over .env file', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-from-env';
    const tmpDir = mkdtempSync(join(tmpdir(), 'wfskill-'));
    writeFileSync(join(tmpDir, '.env'), 'ANTHROPIC_API_KEY=sk-from-dotenv\n');

    const config = loadConfig(tmpDir);
    expect(config.anthropicApiKey).toBe('sk-from-env');

    rmSync(tmpDir, { recursive: true });
  });

  it('parses .env with comments and blank lines', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const tmpDir = mkdtempSync(join(tmpdir(), 'wfskill-'));
    writeFileSync(
      join(tmpDir, '.env'),
      '# This is a comment\n\nANTHROPIC_API_KEY=sk-test\n\n# Another comment\n',
    );

    const config = loadConfig(tmpDir);
    expect(config.anthropicApiKey).toBe('sk-test');

    rmSync(tmpDir, { recursive: true });
  });

  it('strips quotes from .env values', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const tmpDir = mkdtempSync(join(tmpdir(), 'wfskill-'));
    writeFileSync(join(tmpDir, '.env'), 'ANTHROPIC_API_KEY="sk-quoted"\n');

    const config = loadConfig(tmpDir);
    expect(config.anthropicApiKey).toBe('sk-quoted');

    rmSync(tmpDir, { recursive: true });
  });
});
