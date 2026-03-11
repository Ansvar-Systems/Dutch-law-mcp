import { describe, expect, it } from 'vitest';

import { withSqliteLockRetry } from '../../src/utils/sqlite-retry.js';

describe('withSqliteLockRetry', () => {
  it('retries lock errors and returns the successful result', async () => {
    let attempts = 0;

    const result = await withSqliteLockRetry(() => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('database is locked');
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not swallow non-lock errors', async () => {
    await expect(
      withSqliteLockRetry(() => {
        throw new Error('bad sql');
      }),
    ).rejects.toThrow('bad sql');
  });
});
