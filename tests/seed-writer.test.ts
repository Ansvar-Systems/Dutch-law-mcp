import { describe, it, expect } from 'vitest';
import { buildSeed } from '../src/ingest/seed-writer.js';

// Shared seed builder (PR #117 review fix). Three scripts wrote seeds with
// three different shapes/stampings (ingest-bwb stamped, backfill stamped
// without toestand, single-id ingest did not stamp at all). One builder, one
// shape, always stamped — so the refresh policy can reason about every seed.

describe('buildSeed', () => {
  const provisions = [
    { provision_ref: '1', article: '1', content: 'Tekst 1.' },
    { provision_ref: '2', article: '2', title: 'Kopje', content: 'Tekst 2.' },
  ];

  it('builds the canonical seed shape with an _ingest stamp including toestand', () => {
    const seed = buildSeed({
      bwbId: 'BWBR0001854',
      title: 'Wetboek van Strafrecht',
      provisions,
      in_force_date: '2026-01-01',
      sruModified: '2024-05-24',
      toestand: '2026-01-01_0',
      now: '2026-06-10T12:00:00Z',
    });
    expect(seed.documents).toEqual([
      {
        id: 'BWBR0001854',
        type: 'statute',
        title: 'Wetboek van Strafrecht',
        status: 'in_force',
        in_force_date: '2026-01-01',
        url: 'https://wetten.overheid.nl/BWBR0001854',
      },
    ]);
    expect(seed.provisions[0]).toEqual({
      document_id: 'BWBR0001854',
      provision_ref: '1',
      book: undefined,
      chapter: undefined,
      section: undefined,
      article: '1',
      title: undefined,
      content: 'Tekst 1.',
    });
    expect(seed._ingest).toEqual({
      retrieved_at: '2026-06-10T12:00:00Z',
      sru_modified: '2024-05-24',
      toestand: '2026-01-01_0',
    });
  });

  it('omits in_force_date when not provided', () => {
    const seed = buildSeed({
      bwbId: 'BWBR0000001',
      title: 'T',
      provisions,
      sruModified: null,
      toestand: null,
      now: '2026-06-10T12:00:00Z',
    });
    expect('in_force_date' in seed.documents[0]).toBe(false);
    expect(seed._ingest.sru_modified).toBeNull();
    expect(seed._ingest.toestand).toBeNull();
  });
});
