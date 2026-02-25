// Tools: sheets.read, sheets.write, sheets.append — Google Sheets integration via googleapis.

import { sheets } from '@googleapis/sheets';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolDescriptor, ToolResult } from '../../types/index.js';

// ─── Tool descriptors ────────────────────────────────────────────────────────

export const readDescriptor: ToolDescriptor = {
  name: 'sheets.read',
  description: 'Read values from a Google Sheets range.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:C10")' },
    },
    required: ['spreadsheet_id', 'range'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      values: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    },
  },
};

export const writeDescriptor: ToolDescriptor = {
  name: 'sheets.write',
  description: 'Write values to a Google Sheets range (overwrites existing data).',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range' },
      values: { type: 'array', items: { type: 'array' }, description: 'Rows of values to write' },
    },
    required: ['spreadsheet_id', 'range', 'values'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      updated_cells: { type: 'number', description: 'Number of cells updated' },
    },
  },
};

export const appendDescriptor: ToolDescriptor = {
  name: 'sheets.append',
  description: 'Append rows to a Google Sheets range.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range to append after' },
      values: { type: 'array', items: { type: 'array' }, description: 'Rows of values to append' },
    },
    required: ['spreadsheet_id', 'range', 'values'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      updated_range: { type: 'string', description: 'The range that was updated' },
    },
  },
};

// ─── Handlers ────────────────────────────────────────────────────────────────

export function createHandlers(auth: OAuth2Client) {
  const client = sheets({ version: 'v4', auth });

  async function read(args: Record<string, unknown>): Promise<ToolResult> {
    const spreadsheetId = args.spreadsheet_id as string | undefined;
    const range = args.range as string | undefined;

    if (!spreadsheetId || !range) {
      return { output: null, error: 'sheets.read: "spreadsheet_id" and "range" are required' };
    }

    try {
      const res = await client.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return { output: { values: res.data.values ?? [] } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `sheets.read failed: ${message}` };
    }
  }

  async function write(args: Record<string, unknown>): Promise<ToolResult> {
    const spreadsheetId = args.spreadsheet_id as string | undefined;
    const range = args.range as string | undefined;
    const values = args.values as unknown[][] | undefined;

    if (!spreadsheetId || !range || !values) {
      return { output: null, error: 'sheets.write: "spreadsheet_id", "range", and "values" are required' };
    }

    try {
      const res = await client.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      return { output: { updated_cells: res.data.updatedCells ?? 0 } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `sheets.write failed: ${message}` };
    }
  }

  async function append(args: Record<string, unknown>): Promise<ToolResult> {
    const spreadsheetId = args.spreadsheet_id as string | undefined;
    const range = args.range as string | undefined;
    const values = args.values as unknown[][] | undefined;

    if (!spreadsheetId || !range || !values) {
      return { output: null, error: 'sheets.append: "spreadsheet_id", "range", and "values" are required' };
    }

    try {
      const res = await client.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      return { output: { updated_range: res.data.updates?.updatedRange ?? '' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: null, error: `sheets.append failed: ${message}` };
    }
  }

  return { read, write, append };
}
