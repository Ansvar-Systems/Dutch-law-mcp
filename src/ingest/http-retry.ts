/**
 * Shared HTTP retry helper (PR #117 review fix).
 *
 * Transient failures (5xx, 429, thrown network errors) retry with backoff and
 * then THROW. They are never soft-failed to null or skipped, so a flaky
 * network can never be recorded as "document gone upstream" — the defect that
 * let the old backfill script write live statutes into its gone-list.
 * Non-retryable client errors (404 and other 4xx) are returned for the caller
 * to interpret: a 404 on a document fetch IS a finding, not an error.
 */

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  opts: {
    fetchImpl?: typeof fetch;
    attempts?: number;
    backoffMs?: number[];
  } = {},
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const attempts = opts.attempts ?? 4;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  let lastProblem = 'unknown';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url, { redirect: 'follow' });
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        lastProblem = `HTTP ${res.status}`;
      } else {
        return res; // non-retryable 4xx: the caller decides what it means
      }
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }
    if (attempt < attempts) {
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    }
  }
  throw new Error(`fetch ${url} failed after ${attempts} attempts: ${lastProblem}`);
}
