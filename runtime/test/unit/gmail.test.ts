// Tests for src/adapters/tools/gmail.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @googleapis/gmail
const mockList = vi.fn();
const mockGet = vi.fn();
const mockSend = vi.fn();

vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({
    users: {
      messages: {
        list: mockList,
        get: mockGet,
        send: mockSend,
      },
    },
  }),
  gmail_v1: { Schema$Message: {}, Schema$MessagePartHeader: {} },
}));

import {
  createHandlers,
  searchDescriptor,
  readDescriptor,
  sendDescriptor,
} from '../../src/adapters/tools/gmail.js';

describe('gmail tools', () => {
  const fakeAuth = {} as Parameters<typeof createHandlers>[0];
  let handlers: ReturnType<typeof createHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createHandlers(fakeAuth);
  });

  describe('descriptors', () => {
    it('search descriptor has correct name', () => {
      expect(searchDescriptor.name).toBe('gmail.search');
    });

    it('read descriptor has correct name', () => {
      expect(readDescriptor.name).toBe('gmail.read');
    });

    it('send descriptor has correct name', () => {
      expect(sendDescriptor.name).toBe('gmail.send');
    });
  });

  describe('gmail.search', () => {
    it('returns error when query is missing', async () => {
      const result = await handlers.search({});
      expect(result.error).toContain('"query" is required');
    });

    it('returns messages matching the query', async () => {
      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg1' }] },
      });
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg1',
          snippet: 'Hello there',
          payload: {
            headers: [
              { name: 'From', value: 'alice@test.com' },
              { name: 'To', value: 'bob@test.com' },
              { name: 'Subject', value: 'Test email' },
              { name: 'Date', value: '2024-01-01' },
            ],
          },
        },
      });

      const result = await handlers.search({ query: 'from:alice' });
      expect(result.output).toEqual({
        messages: [
          {
            id: 'msg1',
            from: 'alice@test.com',
            to: 'bob@test.com',
            subject: 'Test email',
            snippet: 'Hello there',
            date: '2024-01-01',
          },
        ],
      });
    });

    it('handles API errors gracefully', async () => {
      mockList.mockRejectedValueOnce(new Error('API error'));
      const result = await handlers.search({ query: 'test' });
      expect(result.error).toContain('gmail.search failed');
    });
  });

  describe('gmail.read', () => {
    it('returns error when message_id is missing', async () => {
      const result = await handlers.read({});
      expect(result.error).toContain('"message_id" is required');
    });

    it('returns full message content', async () => {
      const bodyData = Buffer.from('Hello world').toString('base64url');
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg1',
          snippet: 'Hello world',
          payload: {
            headers: [
              { name: 'From', value: 'alice@test.com' },
              { name: 'To', value: 'bob@test.com' },
              { name: 'Subject', value: 'Test' },
              { name: 'Date', value: '2024-01-01' },
            ],
            body: { data: bodyData },
          },
        },
      });

      const result = await handlers.read({ message_id: 'msg1' });
      expect(result.output).toEqual({
        id: 'msg1',
        from: 'alice@test.com',
        to: 'bob@test.com',
        subject: 'Test',
        body: 'Hello world',
        date: '2024-01-01',
      });
    });

    it('decodes body from multipart text/plain', async () => {
      const bodyData = Buffer.from('Plain text body').toString('base64url');
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg2',
          payload: {
            headers: [],
            parts: [
              { mimeType: 'text/html', body: { data: 'aHRtbA' } },
              { mimeType: 'text/plain', body: { data: bodyData } },
            ],
          },
        },
      });

      const result = await handlers.read({ message_id: 'msg2' });
      const output = result.output as Record<string, unknown>;
      expect(output.body).toBe('Plain text body');
    });
  });

  describe('gmail.send', () => {
    it('returns error when required fields are missing', async () => {
      const result = await handlers.send({ to: 'bob@test.com' });
      expect(result.error).toContain('"to", "subject", and "body" are required');
    });

    it('sends an email and returns message_id', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'sent-msg-1' },
      });

      const result = await handlers.send({
        to: 'bob@test.com',
        subject: 'Hello',
        body: 'Message body',
      });

      expect(result.output).toEqual({ message_id: 'sent-msg-1' });
      expect(mockSend).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: { raw: expect.any(String) },
      });
    });

    it('handles API errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Send failed'));
      const result = await handlers.send({
        to: 'bob@test.com',
        subject: 'Test',
        body: 'Body',
      });
      expect(result.error).toContain('gmail.send failed');
    });
  });
});
