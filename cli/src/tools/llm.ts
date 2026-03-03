// llm tool — calls Claude via the Anthropic SDK and returns a parsed JSON object.

import Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from 'workflowskill';

export interface LlmInput {
  prompt: string;
  system?: string;
  schema?: object;
  model?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

let _client: Anthropic | undefined;

function getClient(): Anthropic {
  _client ??= new Anthropic();
  return _client;
}

/** Exposed for testing — allows injecting a mock client. */
export function setClient(client: Anthropic): void {
  _client = client;
}

export async function llm(args: Record<string, unknown>): Promise<ToolResult> {
  const prompt = args['prompt'];
  if (typeof prompt !== 'string' || !prompt) {
    return { output: null, error: 'llm: "prompt" is required and must be a string' };
  }

  const systemBase = typeof args['system'] === 'string' ? args['system'] + '\n\n' : '';
  const schema = args['schema'];
  const model = typeof args['model'] === 'string' ? args['model'] : DEFAULT_MODEL;

  const schemaConstraint = schema
    ? `Respond with a JSON object matching this schema:\n${JSON.stringify(schema, null, 2)}\n\n`
    : '';
  const system =
    systemBase + schemaConstraint + 'Always respond with valid JSON only. No markdown, no prose.';

  let text: string;
  try {
    const client = getClient();
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== 'text') {
      return { output: null, error: 'llm: unexpected response format from Anthropic API' };
    }
    text = block.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: null, error: `llm: Anthropic API error: ${msg}` };
  }

  // Strip markdown code fences if present
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(stripped);
    return { output: parsed };
  } catch {
    return { output: null, error: `llm: failed to parse JSON response: ${stripped.slice(0, 200)}` };
  }
}
