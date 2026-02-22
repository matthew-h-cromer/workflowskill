// Tests for src/adapters/tools/sheets.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @googleapis/sheets
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockAppend = vi.fn();

vi.mock('@googleapis/sheets', () => ({
  sheets: () => ({
    spreadsheets: {
      values: {
        get: mockGet,
        update: mockUpdate,
        append: mockAppend,
      },
    },
  }),
}));

import {
  createHandlers,
  readDescriptor,
  writeDescriptor,
  appendDescriptor,
} from '../../src/adapters/tools/sheets.js';

describe('sheets tools', () => {
  const fakeAuth = {} as Parameters<typeof createHandlers>[0];
  let handlers: ReturnType<typeof createHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createHandlers(fakeAuth);
  });

  describe('descriptors', () => {
    it('read descriptor has correct name', () => {
      expect(readDescriptor.name).toBe('sheets.read');
    });

    it('write descriptor has correct name', () => {
      expect(writeDescriptor.name).toBe('sheets.write');
    });

    it('append descriptor has correct name', () => {
      expect(appendDescriptor.name).toBe('sheets.append');
    });
  });

  describe('sheets.read', () => {
    it('returns error when required params are missing', async () => {
      const result = await handlers.read({});
      expect(result.error).toContain('"spreadsheet_id" and "range" are required');
    });

    it('reads values from a range', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          values: [
            ['Name', 'Age'],
            ['Alice', '30'],
          ],
        },
      });

      const result = await handlers.read({
        spreadsheet_id: 'sheet-123',
        range: 'Sheet1!A1:B2',
      });

      expect(result.output).toEqual({
        values: [
          ['Name', 'Age'],
          ['Alice', '30'],
        ],
      });
      expect(mockGet).toHaveBeenCalledWith({
        spreadsheetId: 'sheet-123',
        range: 'Sheet1!A1:B2',
      });
    });

    it('returns empty array when no values', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });
      const result = await handlers.read({
        spreadsheet_id: 'sheet-123',
        range: 'Sheet1!A1:B2',
      });
      expect(result.output).toEqual({ values: [] });
    });

    it('handles API errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const result = await handlers.read({
        spreadsheet_id: 'bad-id',
        range: 'A1',
      });
      expect(result.error).toContain('sheets.read failed');
    });
  });

  describe('sheets.write', () => {
    it('returns error when required params are missing', async () => {
      const result = await handlers.write({ spreadsheet_id: 'x' });
      expect(result.error).toContain('"spreadsheet_id", "range", and "values" are required');
    });

    it('writes values to a range', async () => {
      mockUpdate.mockResolvedValueOnce({
        data: { updatedCells: 4 },
      });

      const result = await handlers.write({
        spreadsheet_id: 'sheet-123',
        range: 'Sheet1!A1:B2',
        values: [
          ['Name', 'Age'],
          ['Bob', '25'],
        ],
      });

      expect(result.output).toEqual({ updated_cells: 4 });
      expect(mockUpdate).toHaveBeenCalledWith({
        spreadsheetId: 'sheet-123',
        range: 'Sheet1!A1:B2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['Name', 'Age'],
            ['Bob', '25'],
          ],
        },
      });
    });
  });

  describe('sheets.append', () => {
    it('returns error when required params are missing', async () => {
      const result = await handlers.append({});
      expect(result.error).toContain('"spreadsheet_id", "range", and "values" are required');
    });

    it('appends rows to a range', async () => {
      mockAppend.mockResolvedValueOnce({
        data: { updates: { updatedRange: 'Sheet1!A3:B3' } },
      });

      const result = await handlers.append({
        spreadsheet_id: 'sheet-123',
        range: 'Sheet1!A1:B1',
        values: [['Charlie', '35']],
      });

      expect(result.output).toEqual({ updated_range: 'Sheet1!A3:B3' });
    });

    it('handles API errors', async () => {
      mockAppend.mockRejectedValueOnce(new Error('Permission denied'));
      const result = await handlers.append({
        spreadsheet_id: 'x',
        range: 'A1',
        values: [['val']],
      });
      expect(result.error).toContain('sheets.append failed');
    });
  });
});
