/**
 * Refresh policy for the BWB ingest (fleet issue ansvar-mcp-fleet#233).
 *
 * Default mode is additive-only: existing seeds are skipped, exactly as the
 * ingest has always behaved. `--refresh` decides per statute whether to
 * refetch, keyed on the TOESTAND version (the consolidation identity) when the
 * upstream SRU record carries one:
 *
 *   - newer upstream toestand            -> refetch_changed
 *   - equal toestand                     -> skip_current
 *   - no stored toestand stamp           -> refetch_unknown (pre-fix seeds
 *     self-heal: every seed written before toestand stamping is re-acquired
 *     under newest-toestand selection)
 *   - upstream older than stored         -> refetch_unknown (inconsistent;
 *     settles after one refetch re-stamps the fetched toestand)
 *
 * Only when upstream offers no toestand does the policy fall back to the OWMS
 * `modified` date. That date has calendar-day granularity, so equality proves
 * freshness only if the seed was retrieved AFTER the modified day ended — a
 * statute fetched on the day it changed can change again the same day.
 *
 * Whenever freshness cannot be PROVEN (no stamp, no upstream signal,
 * unparseable values) the policy refetches — never a silent skip (accuracy
 * over cheapness).
 */

import { parseToestandKey, compareToestand } from './toestand.js';

export interface SeedIngestMeta {
  retrieved_at?: string;
  sru_modified?: string | null;
  /** Toestand version the seed content was fetched from, e.g. '2026-06-04_0'. */
  toestand?: string | null;
}

export type FetchDecision =
  | 'fetch_new'
  | 'refetch_changed'
  | 'refetch_unknown'
  | 'skip_current'
  | 'skip_existing';

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function decideFetch(opts: {
  seedExists: boolean;
  refresh: boolean;
  existingMeta?: SeedIngestMeta | null;
  sruModified?: string | null;
  /** Newest in-force toestand offered upstream, e.g. '2026-06-04_0'. */
  upstreamToestand?: string | null;
}): FetchDecision {
  if (!opts.seedExists) return 'fetch_new';
  if (!opts.refresh) return 'skip_existing';

  const upstreamToestand = parseToestandKey(opts.upstreamToestand);
  if (upstreamToestand) {
    const storedToestand = parseToestandKey(opts.existingMeta?.toestand);
    if (!storedToestand) return 'refetch_unknown';
    const cmp = compareToestand(upstreamToestand, storedToestand);
    if (cmp > 0) return 'refetch_changed';
    if (cmp === 0) return 'skip_current';
    return 'refetch_unknown';
  }

  const stored = parseDate(opts.existingMeta?.sru_modified);
  const upstream = parseDate(opts.sruModified);
  if (stored == null || upstream == null) return 'refetch_unknown';
  if (upstream > stored) return 'refetch_changed';
  if (upstream < stored) return 'refetch_unknown';

  // Equal calendar dates: only a retrieval that postdates the modified day
  // proves the seed saw the day's final state.
  const storedDay = (opts.existingMeta?.sru_modified ?? '').slice(0, 10);
  const retrievedDay = (opts.existingMeta?.retrieved_at ?? '').slice(0, 10);
  if (!retrievedDay || retrievedDay <= storedDay) return 'refetch_unknown';
  return 'skip_current';
}

export function stampIngestMeta<T extends object>(
  seed: T,
  opts: { sruModified: string | null | undefined; toestand?: string | null; now: string },
): T & {
  _ingest: { retrieved_at: string; sru_modified: string | null; toestand: string | null };
} {
  return {
    ...seed,
    _ingest: {
      retrieved_at: opts.now,
      sru_modified: opts.sruModified ?? null,
      toestand: opts.toestand ?? null,
    },
  };
}
