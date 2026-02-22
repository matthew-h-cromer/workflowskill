// Tools: gmail.search, gmail.read, gmail.send — Gmail integration via googleapis.

import { gmail, gmail_v1 } from '@googleapis/gmail';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolDescriptor, ToolResult } from '../../types/index.js';

// ─── Tool descriptors ────────────────────────────────────────────────────────

export const searchDescriptor: ToolDescriptor = {
  name: 'gmail.search',
  description: 'Search Gmail messages matching a query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Gmail search query (same syntax as Gmail search bar)' },
      max_results: { type: 'number', description: 'Maximum messages to return (default: 10)' },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            subject: { type: 'string' },
            snippet: { type: 'string' },
            date: { type: 'string' },
          },
        },
      },
    },
  },
};

export const readDescriptor: ToolDescriptor = {
  name: 'gmail.read',
  description: 'Read a full Gmail message by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Gmail message ID' },
    },
    required: ['message_id'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      date: { type: 'string' },
    },
  },
};

export const sendDescriptor: ToolDescriptor = {
  name: 'gmail.send',
  description: 'Send an email via Gmail.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body (plain text)' },
    },
    required: ['to', 'subject', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      message_id: { type: 'string' },
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBody(message: gmail_v1.Schema$Message): string {
  // Try to get plain text body from parts
  const parts = message.payload?.parts;
  if (parts) {
    const textPart = parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
    }
  }
  // Fallback to payload body
  if (message.payload?.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64url').toString('utf-8');
  }
  return message.snippet ?? '';
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export function createHandlers(auth: OAuth2Client) {
  const client = gmail({ version: 'v1', auth });

  async function search(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    const maxResults = (args.max_results as number | undefined) ?? 10;

    if (!query || typeof query !== 'string') {
      return { output: null, error: 'gmail.search: "query" is required' };
    }

    try {
      const listRes = await client.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      const messageIds = listRes.data.messages ?? [];
      const messages = await Promise.all(
        messageIds.map(async (m: gmail_v1.Schema$Message) => {
          const msg = await client.users.messages.get({
            userId: 'me',
            id: m.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });
          const headers = msg.data.payload?.headers;
          return {
            id: msg.data.id ?? '',
            from: getHeader(headers, 'From'),
            to: getHeader(headers, 'To'),
            subject: getHeader(headers, 'Subject'),
            snippet: msg.data.snippet ?? '',
            date: getHeader(headers, 'Date'),
          };
        }),
      );

      return { output: { messages } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `gmail.search failed: ${message}` };
    }
  }

  async function read(args: Record<string, unknown>): Promise<ToolResult> {
    const messageId = args.message_id as string | undefined;

    if (!messageId || typeof messageId !== 'string') {
      return { output: null, error: 'gmail.read: "message_id" is required' };
    }

    try {
      const msg = await client.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = msg.data.payload?.headers;
      return {
        output: {
          id: msg.data.id ?? '',
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          subject: getHeader(headers, 'Subject'),
          body: decodeBody(msg.data),
          date: getHeader(headers, 'Date'),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `gmail.read failed: ${message}` };
    }
  }

  async function send(args: Record<string, unknown>): Promise<ToolResult> {
    const to = args.to as string | undefined;
    const subject = args.subject as string | undefined;
    const body = args.body as string | undefined;

    if (!to || !subject || !body) {
      return { output: null, error: 'gmail.send: "to", "subject", and "body" are required' };
    }

    try {
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
      ).toString('base64url');

      const res = await client.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });

      return { output: { message_id: res.data.id ?? '' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `gmail.send failed: ${message}` };
    }
  }

  return { search, read, send };
}
