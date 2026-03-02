// Configuration loader — reads env vars with .env fallback.
// No external dependencies (simple KEY=VALUE parser).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Google OAuth2 credentials for Gmail/Sheets tools. */
export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** WorkflowSkill configuration. */
export interface WorkflowSkillConfig {
  anthropicApiKey?: string;
  googleCredentials?: GoogleCredentials;
}

/**
 * Parse a .env file into key-value pairs.
 * Supports KEY=VALUE format, blank lines, and # comments.
 * Values may be optionally quoted with single or double quotes.
 */
function parseDotenv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

/**
 * Find the package root by walking up from this module's directory
 * until we find a directory containing package.json.
 */
function findPackageRoot(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // true filesystem root
    dir = parent;
  }
  return undefined;
}

/**
 * Load configuration from environment variables, with .env fallback.
 * Environment variables take precedence over .env file values.
 *
 * .env search order:
 * 1. Explicit `cwd` parameter (for tests)
 * 2. Package root (found by walking up from this module)
 * 3. process.cwd()
 */
export function loadConfig(cwd?: string): WorkflowSkillConfig {
  // Try to read .env file
  let dotenvVars: Record<string, string> = {};
  const searchDirs = cwd
    ? [cwd]
    : [findPackageRoot(), process.cwd()].filter((d): d is string => d !== undefined);

  for (const dir of searchDirs) {
    try {
      const envPath = join(dir, '.env');
      const content = readFileSync(envPath, 'utf-8');
      dotenvVars = parseDotenv(content);
      break; // use the first .env found
    } catch {
      // No .env file in this directory — try next
    }
  }

  // Env vars take precedence
  const get = (key: string): string | undefined =>
    process.env[key] ?? dotenvVars[key];

  const config: WorkflowSkillConfig = {};

  const anthropicKey = get('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    config.anthropicApiKey = anthropicKey;
  }

  const clientId = get('GOOGLE_CLIENT_ID');
  const clientSecret = get('GOOGLE_CLIENT_SECRET');
  const refreshToken = get('GOOGLE_REFRESH_TOKEN');
  if (clientId && clientSecret && refreshToken) {
    config.googleCredentials = { clientId, clientSecret, refreshToken };
  }

  return config;
}
