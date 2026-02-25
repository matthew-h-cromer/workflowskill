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

    it('trims text content', async () => {
      const html = '<ul><li>  padded  </li></ul>';
      const result = await handler({ html, selector: 'li' });
      expect(result.output).toEqual({ results: ['padded'] });
    });
  });

  describe('fields mode', () => {
    const cardHtml = `
<html><body>
  <div class="card" data-id="1">
    <h3 class="title">Alpha</h3>
    <a class="link" href="/alpha">View</a>
    <span class="tag">new</span>
  </div>
  <div class="card" data-id="2">
    <h3 class="title">  Beta  </h3>
    <a class="link" href="/beta">View</a>
  </div>
  <div class="card" data-id="3">
    <h3 class="title">Gamma</h3>
    <a class="link" href="/gamma">View</a>
    <span class="tag">featured</span>
  </div>
</body></html>`;

    it('extracts multiple fields per matched parent', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { title: 'h3.title', link_text: 'a.link' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', link_text: 'View' },
          { title: 'Beta', link_text: 'View' },
          { title: 'Gamma', link_text: 'View' },
        ],
      });
    });

    it('extracts attributes via @attr suffix', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { title: 'h3.title', url: 'a.link @href' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', url: '/alpha' },
          { title: 'Beta', url: '/beta' },
          { title: 'Gamma', url: '/gamma' },
        ],
      });
    });

    it('extracts parent attribute via bare @attr', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { id: '@data-id', title: 'h3.title' },
      });
      expect(result.output).toEqual({
        results: [
          { id: '1', title: 'Alpha' },
          { id: '2', title: 'Beta' },
          { id: '3', title: 'Gamma' },
        ],
      });
    });

    it('returns null for missing sub-elements', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { title: 'h3.title', tag: 'span.tag' },
      });
      expect(result.output).toEqual({
        results: [
          { title: 'Alpha', tag: 'new' },
          { title: 'Beta', tag: null },
          { title: 'Gamma', tag: 'featured' },
        ],
      });
    });

    it('respects limit with fields', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { title: 'h3.title' },
        limit: 2,
      });
      expect(result.output).toEqual({
        results: [{ title: 'Alpha' }, { title: 'Beta' }],
      });
    });

    it('trims text content in fields mode', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { title: 'h3.title' },
        limit: 2,
      });
      // Second card has "  Beta  " in source — should be trimmed
      const results = (result.output as { results: Array<Record<string, string | null>> }).results;
      expect(results[1]!.title).toBe('Beta');
    });

    it('returns null for missing attribute', async () => {
      const result = await handler({
        html: cardHtml,
        selector: 'div.card',
        fields: { missing: '@data-nonexistent' },
        limit: 1,
      });
      expect(result.output).toEqual({ results: [{ missing: null }] });
    });
  });
});
