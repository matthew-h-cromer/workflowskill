// Tests for src/adapters/tools/html-select.ts

import { describe, it, expect } from 'vitest';
import { handler, descriptor } from '../../src/adapters/tools/html-select.js';

const sampleHtml = `
<html>
<body>
  <h1>Title</h1>
  <ul>
    <li class="item"><a href="/a">Alpha</a></li>
    <li class="item"><a href="/b">Beta</a></li>
    <li class="item"><a href="/c">Gamma</a></li>
  </ul>
  <p id="desc">A description</p>
</body>
</html>
`;

describe('html.select tool', () => {
  describe('descriptor', () => {
    it('has the correct name', () => {
      expect(descriptor.name).toBe('html.select');
    });

    it('requires html and selector', () => {
      expect(descriptor.inputSchema?.required).toEqual(['html', 'selector']);
    });
  });

  describe('handler', () => {
    it('returns error when html is missing', async () => {
      const result = await handler({ selector: 'p' });
      expect(result.error).toContain('"html" is required');
    });

    it('returns error when selector is missing', async () => {
      const result = await handler({ html: '<p>hi</p>' });
      expect(result.error).toContain('"selector" is required');
    });

    it('extracts text content by default', async () => {
      const result = await handler({ html: sampleHtml, selector: 'h1' });
      expect(result.output).toEqual({ results: ['Title'] });
    });

    it('extracts multiple matching elements', async () => {
      const result = await handler({ html: sampleHtml, selector: 'li.item a' });
      expect(result.output).toEqual({ results: ['Alpha', 'Beta', 'Gamma'] });
    });

    it('extracts attribute values when attribute is specified', async () => {
      const result = await handler({
        html: sampleHtml,
        selector: 'li.item a',
        attribute: 'href',
      });
      expect(result.output).toEqual({ results: ['/a', '/b', '/c'] });
    });

    it('respects limit parameter', async () => {
      const result = await handler({
        html: sampleHtml,
        selector: 'li.item a',
        limit: 2,
      });
      expect(result.output).toEqual({ results: ['Alpha', 'Beta'] });
    });

    it('returns empty results for non-matching selector', async () => {
      const result = await handler({ html: sampleHtml, selector: '.nonexistent' });
      expect(result.output).toEqual({ results: [] });
    });

    it('handles id selector', async () => {
      const result = await handler({ html: sampleHtml, selector: '#desc' });
      expect(result.output).toEqual({ results: ['A description'] });
    });
  });
});
