import { describe, it, expect } from 'vitest';
import {
  parseToestandFromUrl,
  parseToestandKey,
  compareToestand,
  toestandKey,
  selectCurrentToestandRecord,
} from '../src/ingest/toestand.js';

// Toestand selection (fleet#233 follow-up, PR #117 review fix).
// The SRU service returns one record per toestand (consolidation state) of a
// statute, ordered OLDEST-FIRST. Deduplicating by first occurrence therefore
// pinned the corpus to the oldest consolidation: the deployed Criminal Code
// (BWBR0001854) was the 2002-04-01 state, missing computer intrusion (138ab),
// grooming (248e) and human trafficking (273f). The current state must be the
// newest toestand whose date is not in the future.

describe('parseToestandFromUrl', () => {
  it('extracts date and sequence from a repository toestand URL', () => {
    expect(
      parseToestandFromUrl(
        'https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0001854/2026-01-01_0/xml/BWBR0001854_2026-01-01_0.xml',
      ),
    ).toEqual({ date: '2026-01-01', seq: 0 });
  });

  it('returns null for URLs without a toestand path segment', () => {
    expect(
      parseToestandFromUrl(
        'https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0001854/xml/BWBR0001854.xml',
      ),
    ).toBeNull();
    expect(parseToestandFromUrl(undefined)).toBeNull();
    expect(parseToestandFromUrl(null)).toBeNull();
  });
});

describe('parseToestandKey', () => {
  it('parses the stamp form "YYYY-MM-DD_N"', () => {
    expect(parseToestandKey('2026-06-04_0')).toEqual({ date: '2026-06-04', seq: 0 });
    expect(parseToestandKey('2002-01-01_12')).toEqual({ date: '2002-01-01', seq: 12 });
  });

  it('returns null for malformed keys', () => {
    expect(parseToestandKey('not-a-toestand')).toBeNull();
    expect(parseToestandKey('')).toBeNull();
    expect(parseToestandKey(null)).toBeNull();
    expect(parseToestandKey(undefined)).toBeNull();
  });
});

describe('compareToestand / toestandKey', () => {
  it('orders by date, then by sequence number', () => {
    const a = { date: '2002-01-01', seq: 0 };
    const b = { date: '2026-06-04', seq: 0 };
    const c = { date: '2026-06-04', seq: 1 };
    expect(compareToestand(a, b)).toBeLessThan(0);
    expect(compareToestand(b, c)).toBeLessThan(0);
    expect(compareToestand(c, c)).toBe(0);
  });

  it('compares sequence numbers numerically, not lexically', () => {
    expect(
      compareToestand({ date: '2026-01-01', seq: 2 }, { date: '2026-01-01', seq: 10 }),
    ).toBeLessThan(0);
  });

  it('round-trips through toestandKey', () => {
    expect(toestandKey({ date: '2026-06-04', seq: 0 })).toBe('2026-06-04_0');
    expect(parseToestandKey(toestandKey({ date: '2002-01-01', seq: 3 }))).toEqual({
      date: '2002-01-01',
      seq: 3,
    });
  });
});

describe('selectCurrentToestandRecord', () => {
  const rec = (toestandUrl?: string) => ({ toestandUrl });
  const url = (id: string, t: string) =>
    `https://repository.officiele-overheidspublicaties.nl/bwb/${id}/${t}/xml/${id}_${t}.xml`;

  it('selects the newest toestand whose date is not in the future', () => {
    const records = [
      rec(url('BWBR0001854', '2002-04-01_0')),
      rec(url('BWBR0001854', '2019-01-01_0')),
      rec(url('BWBR0001854', '2026-01-01_0')),
    ];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[2]);
  });

  it('does NOT select the first record (the historical oldest-first pin)', () => {
    const records = [
      rec(url('BWBR0001827', '2002-01-01_0')),
      rec(url('BWBR0001827', '2026-06-04_0')),
    ];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });

  it('skips future-dated toestanden when an in-force one exists', () => {
    const records = [
      rec(url('BWBR0000001', '2025-01-01_0')),
      rec(url('BWBR0000001', '2026-07-01_0')), // published, in force next month
    ];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[0]);
  });

  it('falls back to the earliest future toestand when none is in force yet', () => {
    const records = [
      rec(url('BWBR0000002', '2026-09-01_0')),
      rec(url('BWBR0000002', '2026-07-01_0')),
    ];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });

  it('prefers the higher sequence number on the same date (same-day re-issue)', () => {
    const records = [
      rec(url('BWBR0000003', '2026-01-01_0')),
      rec(url('BWBR0000003', '2026-01-01_1')),
    ];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });

  it('prefers any dated record over records without a toestand URL', () => {
    const records = [rec(undefined), rec(url('BWBR0000004', '2010-01-01_0'))];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });

  it('returns the LAST record when none carries a toestand URL (SRU is oldest-first)', () => {
    const records = [rec(undefined), rec(undefined)];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });

  it('returns null for an empty record list', () => {
    expect(selectCurrentToestandRecord([], '2026-06-10')).toBeNull();
  });
});

describe('selectCurrentToestandRecord — no-parseable-URL fallback (delta review)', () => {
  // SRU orders toestand records OLDEST-FIRST. When no URL in a group parses,
  // falling back to the FIRST record re-creates the oldest-consolidation pin;
  // the LAST record is the newest available.
  it('falls back to the LAST record when none carries a parseable toestand URL', () => {
    const records = [{ toestandUrl: undefined }, { toestandUrl: 'https://x.test/weird-shape' }];
    expect(selectCurrentToestandRecord(records, '2026-06-10')).toBe(records[1]);
  });
});
