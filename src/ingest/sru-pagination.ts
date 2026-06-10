/**
 * SRU discovery hardening (fleet issue ansvar-mcp-fleet#233).
 *
 * 2026-06-10 incident: one transient bad SRU response parsed as "no records,
 * no next page", which the pagination loop read as a SUCCESSFUL end of
 * pagination — silently truncating discovery from 24,030 declared records to
 * 150. Two rules close that class:
 *
 * 1. A broken page (zero records AND no next position, or a thrown fetch
 *    error) is RETRIED with backoff and then fails LOUD — it is never an end
 *    condition. A genuine last page has records and merely lacks a next
 *    position.
 * 2. A finished discovery that found fewer records than the service declared
 *    throws — a partial worklist must never silently masquerade as complete.
 */

export interface SruPage<R = unknown> {
  records: R[];
  totalRecords: number;
  nextRecordPosition: number | null;
}

const DEFAULT_BACKOFF_MS = [5_000, 15_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPageWithRetry<P extends SruPage<unknown>>(
  fetchPage: (startRecord: number) => Promise<P>,
  startRecord: number,
  opts: { attempts?: number; backoffMs?: number[]; isHealthy?: (page: P) => boolean } = {},
): Promise<P> {
  const attempts = opts.attempts ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  // Default health: has records (a genuine last page has records and null next).
  const isHealthy = opts.isHealthy ?? ((page: P) => page.records.length > 0);
  let lastProblem = 'unknown';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const page = await fetchPage(startRecord);
      if (isHealthy(page)) return page;
      lastProblem = 'empty page with no records (malformed or throttled response)';
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }
    if (attempt < attempts) {
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    }
  }
  throw new Error(
    `SRU page at startRecord ${startRecord} failed after ${attempts} attempts: ${lastProblem}. ` +
      'Refusing to treat a broken page as end-of-pagination (silent truncation).',
  );
}

export function assertDiscoveryComplete(found: number, declaredTotal: number): void {
  if (found < declaredTotal) {
    throw new Error(
      `SRU discovery ended with ${found} records but the service declared ${declaredTotal}. ` +
        'Refusing to proceed with a silently truncated worklist.',
    );
  }
}
