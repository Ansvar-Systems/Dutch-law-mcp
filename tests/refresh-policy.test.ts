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

  it('skips when the stored stamp is at least as new as upstream', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: { sru_modified: '2026-05-02' },
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

describe('stampIngestMeta', () => {
  it('stamps retrieved_at and sru_modified onto the seed', () => {
    const seed = { bwb_id: 'BWBR0001821', provisions: [] };
    const out = stampIngestMeta(seed, { sruModified: '2026-05-02', now: '2026-06-10T08:00:00Z' });
    expect(out._ingest).toEqual({
      retrieved_at: '2026-06-10T08:00:00Z',
      sru_modified: '2026-05-02',
    });
    expect(out.bwb_id).toBe('BWBR0001821');
  });

  it('stores null when upstream offered no modified date', () => {
    const out = stampIngestMeta({}, { sruModified: null, now: '2026-06-10T08:00:00Z' });
    expect(out._ingest.sru_modified).toBeNull();
  });
});
