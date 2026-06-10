import { describe, it, expect } from 'vitest';
import { decideFetch, stampIngestMeta } from '../src/ingest/refresh-policy.js';

// Refresh policy for the BWB ingest (fleet issue ansvar-mcp-fleet#233).
// Default mode stays additive-only (skip existing seeds, unchanged behaviour).
// --refresh compares the upstream OWMS `modified` date against the date stored
// in the seed's _ingest stamp and refetches only what changed — never a silent
// skip when freshness cannot be proven (accuracy over cheapness).

describe('decideFetch — additive mode (default, unchanged behaviour)', () => {
  it('fetches a statute with no existing seed', () => {
    expect(decideFetch({ seedExists: false, refresh: false })).toBe('fetch_new');
  });

  it('skips an existing seed without comparing dates', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: false,
        existingMeta: { sru_modified: '2020-01-01' },
        sruModified: '2026-06-01',
      }),
    ).toBe('skip_existing');
  });
});

describe('decideFetch — refresh mode', () => {
  it('still fetches brand-new statutes', () => {
    expect(decideFetch({ seedExists: false, refresh: true })).toBe('fetch_new');
  });

  it('refetches when upstream modified is newer than the stored stamp', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-01-15' },
        sruModified: '2026-05-02',
      }),
    ).toBe('refetch_changed');
  });

  it('skips when the stored stamp matches upstream and the fetch postdates the modified day', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-05-02', retrieved_at: '2026-05-03T06:00:00Z' },
        sruModified: '2026-05-02',
      }),
    ).toBe('skip_current');
  });

  it('refetches when the seed has no stored stamp (pre-stamp seeds — freshness unprovable)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: null,
        sruModified: '2026-05-02',
      }),
    ).toBe('refetch_unknown');
  });

  it('refetches when upstream offers no modified date (freshness unprovable)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-01-15' },
        sruModified: null,
      }),
    ).toBe('refetch_unknown');
  });

  it('refetches when either date is unparseable', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: 'not-a-date' },
        sruModified: '2026-05-02',
      }),
    ).toBe('refetch_unknown');
  });
});

describe('decideFetch — toestand-keyed refresh (PR #117 review fix)', () => {
  // The toestand version is the content identity of a consolidation. OWMS
  // `modified` is document-level and identical across all toestand records of
  // a statute, so it cannot distinguish "we hold the newest consolidation"
  // from "we hold the 2002 one" — exactly the defect that pinned the deployed
  // Criminal Code to its 2002-04-01 state while stamped as current.
  it('refetches when upstream offers a newer toestand than the stored stamp', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2025-01-09', toestand: '2002-01-01_0' },
        sruModified: '2025-01-09',
        upstreamToestand: '2026-06-04_0',
      }),
    ).toBe('refetch_changed');
  });

  it('skips when the stored toestand equals the upstream one', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2025-01-09', toestand: '2026-06-04_0' },
        sruModified: '2025-01-09',
        upstreamToestand: '2026-06-04_0',
      }),
    ).toBe('skip_current');
  });

  it('refetches seeds with no toestand stamp (pre-fix seeds self-heal)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2025-01-09' },
        sruModified: '2025-01-09',
        upstreamToestand: '2026-06-04_0',
      }),
    ).toBe('refetch_unknown');
  });

  it('refetches when upstream offers only an OLDER toestand than stored (inconsistent state)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2025-01-09', toestand: '2026-06-04_0' },
        sruModified: '2025-01-09',
        upstreamToestand: '2019-01-01_0',
      }),
    ).toBe('refetch_unknown');
  });

  it('prefers same-date higher sequence numbers (same-day re-issue)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { toestand: '2026-01-01_0' },
        upstreamToestand: '2026-01-01_1',
      }),
    ).toBe('refetch_changed');
  });

  it('falls back to sru_modified comparison when upstream has no toestand', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-01-15', toestand: '2020-01-01_0' },
        sruModified: '2026-05-02',
        upstreamToestand: null,
      }),
    ).toBe('refetch_changed');
  });
});

describe('decideFetch — same-day window on the sru_modified fallback', () => {
  // OWMS `modified` is date-granularity. A statute fetched on the same calendar
  // day it was modified can be modified AGAIN later that day without the date
  // changing — equality alone must not prove freshness for such seeds.
  it('refetches on equal dates when the seed was retrieved on (or before) the modified day', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-06-15', retrieved_at: '2026-06-15T09:00:00Z' },
        sruModified: '2026-06-15',
      }),
    ).toBe('refetch_unknown');
  });

  it('skips on equal dates when the seed was retrieved after the modified day ended', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-06-15', retrieved_at: '2026-06-16T09:00:00Z' },
        sruModified: '2026-06-15',
      }),
    ).toBe('skip_current');
  });

  it('refetches on equal dates when retrieved_at is missing (window unprovable)', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-06-15' },
        sruModified: '2026-06-15',
      }),
    ).toBe('refetch_unknown');
  });
});

describe('stampIngestMeta', () => {
  it('stamps retrieved_at, sru_modified and toestand onto the seed', () => {
    const seed = { bwb_id: 'BWBR0001821', provisions: [] };
    const out = stampIngestMeta(seed, {
      sruModified: '2026-05-02',
      toestand: '2026-06-04_0',
      now: '2026-06-10T08:00:00Z',
    });
    expect(out._ingest).toEqual({
      retrieved_at: '2026-06-10T08:00:00Z',
      sru_modified: '2026-05-02',
      toestand: '2026-06-04_0',
    });
    expect(out.bwb_id).toBe('BWBR0001821');
  });

  it('stores null when upstream offered no modified date and no toestand', () => {
    const out = stampIngestMeta({}, { sruModified: null, now: '2026-06-10T08:00:00Z' });
    expect(out._ingest.sru_modified).toBeNull();
    expect(out._ingest.toestand).toBeNull();
  });
});
