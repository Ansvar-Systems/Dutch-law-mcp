import { describe, expect, it } from 'vitest';

import { isAcceptableDbSize } from '../../src/utils/ensure-database.js';

describe('isAcceptableDbSize', () => {
  it('accepts the current ~123 MB free-tier DB', () => {
    expect(isAcceptableDbSize(123 * 1024 * 1024)).toBe(true);
  });

  it('accepts a future ~500 MB premium DB', () => {
    expect(isAcceptableDbSize(500 * 1024 * 1024)).toBe(true);
  });

  it('rejects a 1 KB error response masquerading as the DB', () => {
    expect(isAcceptableDbSize(1024)).toBe(false);
  });

  it('rejects an absurd 10 GB payload', () => {
    expect(isAcceptableDbSize(10 * 1024 * 1024 * 1024)).toBe(false);
  });
});
