import { describe, it, expect, vi } from 'vitest';
import { fetchWithRetry } from '../src/ingest/http-retry.js';

// Shared HTTP retry helper (PR #117 review fix). Transient failures (5xx, 429,
// thrown network errors) are retried with backoff and then THROWN — never
// soft-failed to null/skip, so a flaky network can never be recorded as
// "document gone upstream". Non-retryable client errors (404) are returned for
// the caller to interpret.

const ok = { ok: true, status: 200 } as Response;
const notFound = { ok: false, status: 404 } as Response;
const serverErr = { ok: false, status: 503 } as Response;

describe('fetchWithRetry', () => {
  it('returns the response on first success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl, backoffMs: [0, 0, 0] });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx responses and succeeds on a later attempt', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(serverErr).mockResolvedValueOnce(ok);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl, backoffMs: [0, 0, 0] });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries thrown network errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(ok);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl, backoffMs: [0, 0, 0] });
    expect(res.status).toBe(200);
  });

  it('returns 404 immediately without retrying (caller decides gone-vs-error)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(notFound);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl, backoffMs: [0, 0, 0] });
    expect(res.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('THROWS after exhausting attempts — transient failure must never look like success or gone', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(serverErr);
    await expect(
      fetchWithRetry('https://x.test/a', { fetchImpl, attempts: 3, backoffMs: [0, 0, 0] }),
    ).rejects.toThrow(/503/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
