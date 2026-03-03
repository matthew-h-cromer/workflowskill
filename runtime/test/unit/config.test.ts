// Tests for src/config/index.ts

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

describe('loadConfig', () => {
  it('returns empty config object', () => {
    const config = loadConfig('/nonexistent');
    expect(config).toEqual({});
  });

});
