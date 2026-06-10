/**
 * Refresh policy for the BWB ingest (fleet issue ansvar-mcp-fleet#233).
 *
 * Default mode is additive-only: existing seeds are skipped, exactly as the
 * ingest has always behaved. `--refresh` compares the upstream OWMS `modified`
 * date (from the SRU record) against the date stored in the seed's `_ingest`
 * stamp and refetches only statutes that changed. Whenever freshness cannot be
 * PROVEN (no stamp on the seed, no upstream date, unparseable dates) the
 * policy refetches — never a silent skip (accuracy over cheapness).
 */

export interface SeedIngestMeta {
  retrieved_at?: string;
  sru_modified?: string | null;
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
}): FetchDecision {
  if (!opts.seedExists) return 'fetch_new';
  if (!opts.refresh) return 'skip_existing';

  const stored = parseDate(opts.existingMeta?.sru_modified);
  const upstream = parseDate(opts.sruModified);
  if (stored == null || upstream == null) return 'refetch_unknown';
  return upstream > stored ? 'refetch_changed' : 'skip_current';
}

export function stampIngestMeta<T extends object>(
  seed: T,
  opts: { sruModified: string | null | undefined; now: string },
): T & { _ingest: { retrieved_at: string; sru_modified: string | null } } {
  return {
    ...seed,
    _ingest: { retrieved_at: opts.now, sru_modified: opts.sruModified ?? null },
  };
}
