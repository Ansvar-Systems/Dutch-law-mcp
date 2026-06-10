import { describe, it, expect, vi } from 'vitest';
import { fetchPageWithRetry, assertDiscoveryComplete } from '../src/ingest/sru-pagination.js';

// SRU discovery hardening (fleet issue ansvar-mcp-fleet#233, 2026-06-10 incident):
// a single transient bad SRU response parsed as "no records, no next page", which
// the pagination loop read as a SUCCESSFUL end — truncating discovery from 24,030
// records to 150, silently. Broken pages must retry then fail LOUD; a finished
// discovery that found fewer records than the service declared must throw.

type Page = { records: unknown[]; totalRecords: number; nextRecordPosition: number | null };

const good = (n: number, next: number | null): Page => ({
  records: new Array(n).fill({}),
  totalRecords: 100,
  nextRecordPosition: next,
});
const broken: Page = { records: [], totalRecords: 0, nextRecordPosition: null };

describe('fetchPageWithRetry', () => {
  it('returns a healthy page on first attempt', async () => {
    const fetcher = vi.fn().mockResolvedValue(good(50, 51));
    const page = await fetchPageWithRetry(fetcher, 1, { attempts: 3, backoffMs: [0, 0] });
    expect(page.records.length).toBe(50);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries a broken (empty, no-next) page and succeeds on a later attempt', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(good(50, 101));
    const page = await fetchPageWithRetry(fetcher, 51, { attempts: 3, backoffMs: [0, 0] });
    expect(page.nextRecordPosition).toBe(101);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries thrown fetch errors too', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(good(50, 101));
    const page = await fetchPageWithRetry(fetcher, 51, { attempts: 3, backoffMs: [0, 0] });
    expect(page.records.length).toBe(50);
  });

  it('fails LOUD after exhausting attempts on a persistently broken page', async () => {
    const fetcher = vi.fn().mockResolvedValue(broken);
    await expect(
      fetchPageWithRetry(fetcher, 51, { attempts: 3, backoffMs: [0, 0] }),
    ).rejects.toThrow(/startRecord 51/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('treats a genuine last page (records, no next) as healthy, not broken', async () => {
    const fetcher = vi.fn().mockResolvedValue(good(30, null));
    const page = await fetchPageWithRetry(fetcher, 71, { attempts: 3, backoffMs: [0, 0] });
    expect(page.records.length).toBe(30);
    expect(page.nextRecordPosition).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('assertDiscoveryComplete', () => {
  it('passes when every declared record was found', () => {
    expect(() => assertDiscoveryComplete(24030, 24030)).not.toThrow();
  });

  it('throws when discovery ends short of the declared total (never silently truncate)', () => {
    expect(() => assertDiscoveryComplete(150, 24030)).toThrow(/150.*24030/);
  });
});

describe('fetchPageWithRetry — custom health predicate', () => {
  it('uses isHealthy when provided (raw-count health on a filtered page)', async () => {
    const page = { records: [], rawCount: 50, totalRecords: 100, nextRecordPosition: 51 };
    const fetcher = vi.fn().mockResolvedValue(page);
    const out = await fetchPageWithRetry(fetcher, 1, {
      attempts: 3,
      backoffMs: [0, 0],
      isHealthy: (p: typeof page) => p.rawCount > 0,
    });
    expect(out).toBe(page);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('assertDiscoveryComplete — declared-total validation (PR #117 review fix)', () => {
  // A glitched final page can declare a missing/garbage numberOfRecords; the
  // gate must reject unusable totals instead of passing `found < NaN === false`.
  it('throws when the declared total is null (no page declared a usable total)', () => {
    expect(() => assertDiscoveryComplete(150, null)).toThrow(/total/i);
  });

  it('throws when the declared total is NaN', () => {
    expect(() => assertDiscoveryComplete(150, Number.NaN)).toThrow(/total/i);
  });

  it('throws when the declared total is zero or negative', () => {
    expect(() => assertDiscoveryComplete(150, 0)).toThrow(/total/i);
    expect(() => assertDiscoveryComplete(150, -5)).toThrow(/total/i);
  });
});
