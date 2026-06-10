/**
 * Toestand (consolidation state) selection for the BWB repository.
 *
 * The SRU service returns one record per toestand of a statute, ordered
 * OLDEST-FIRST, and the repository's un-versioned XML URL 301-redirects to the
 * oldest toestand as well. Any "take the first/default" strategy therefore
 * serves the oldest consolidation: the corpus deployed on 2026-06-10 carried
 * the 2002-04-01 Criminal Code (no 138ab/248e/273f) and the 2002-01-01 Code of
 * Civil Procedure (no 1019h). The current state of the law is the NEWEST
 * toestand whose date is not in the future.
 */

export interface ToestandVersion {
  /** In-force date of the consolidation, ISO 'YYYY-MM-DD'. */
  date: string;
  /** Same-date re-issue sequence number (the `_N` suffix). */
  seq: number;
}

const URL_RE = /\/(\d{4}-\d{2}-\d{2})_(\d+)\//;
const KEY_RE = /^(\d{4}-\d{2}-\d{2})_(\d+)$/;

/** Extract the toestand version from a repository toestand URL, if present. */
export function parseToestandFromUrl(url: string | null | undefined): ToestandVersion | null {
  if (!url) return null;
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { date: m[1], seq: Number(m[2]) };
}

/** Parse the `_ingest.toestand` stamp form 'YYYY-MM-DD_N'. */
export function parseToestandKey(key: string | null | undefined): ToestandVersion | null {
  if (!key) return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { date: m[1], seq: Number(m[2]) };
}

/** Stamp form of a toestand version: 'YYYY-MM-DD_N'. */
export function toestandKey(t: ToestandVersion): string {
  return `${t.date}_${t.seq}`;
}

/** Order by date (ISO strings compare lexically), then numerically by seq. */
export function compareToestand(a: ToestandVersion, b: ToestandVersion): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.seq - b.seq;
}

/**
 * Pick the record representing the CURRENT state of the law:
 * the newest toestand with date <= today; if every toestand is future-dated
 * (statute published but not yet in force), the earliest upcoming one; records
 * without a toestand URL only when nothing dated exists.
 */
export function selectCurrentToestandRecord<R extends { toestandUrl?: string }>(
  records: R[],
  today: string,
): R | null {
  if (records.length === 0) return null;

  let bestCurrent: { record: R; version: ToestandVersion } | null = null;
  let bestFuture: { record: R; version: ToestandVersion } | null = null;

  for (const record of records) {
    const version = parseToestandFromUrl(record.toestandUrl);
    if (!version) continue;
    if (version.date <= today) {
      if (!bestCurrent || compareToestand(version, bestCurrent.version) > 0) {
        bestCurrent = { record, version };
      }
    } else if (!bestFuture || compareToestand(version, bestFuture.version) < 0) {
      bestFuture = { record, version };
    }
  }

  return bestCurrent?.record ?? bestFuture?.record ?? records[0];
}
