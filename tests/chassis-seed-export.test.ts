import { describe, it, expect } from 'vitest';
import { toChassisSeed, droppedProvisionRefs } from '../src/ingest/chassis-seed-export.js';

// Adapter the fleet translator expects (ansvar-mcp-fleet mcps/dutch-law/scripts/
// build-chassis-db.ts): canonical StatuteSeed JSON {id, type, title, url,
// provisions:[{provision_ref, content}]} with id "nl:bwb:<digits>". Our ingest
// seeds carry {documents:[...], provisions:[...], _ingest:{...}}.

const seed = {
  documents: [
    {
      id: 'BWBR0040940',
      type: 'statute',
      title: 'Wet op de inlichtingen- en veiligheidsdiensten 2017',
      status: 'in_force',
      url: 'https://wetten.overheid.nl/BWBR0040940',
    },
  ],
  provisions: [
    {
      document_id: 'BWBR0040940',
      provision_ref: '1',
      article: '1',
      content: 'Tekst van artikel 1.',
    },
    {
      document_id: 'BWBR0040940',
      provision_ref: '2',
      article: '2',
      content: 'Tekst van artikel 2.',
    },
  ],
  _ingest: { retrieved_at: '2026-06-10T08:00:00Z', sru_modified: '2025-03-01' },
};

describe('toChassisSeed', () => {
  it('maps a BWB ingest seed to the canonical StatuteSeed shape', () => {
    const out = toChassisSeed(seed);
    expect(out).toEqual({
      id: 'nl:BWBR0040940',
      type: 'statute',
      title: 'Wet op de inlichtingen- en veiligheidsdiensten 2017',
      status: 'in_force',
      url: 'https://wetten.overheid.nl/BWBR0040940',
      provisions: [
        { provision_ref: '1', content: 'Tekst van artikel 1.' },
        { provision_ref: '2', content: 'Tekst van artikel 2.' },
      ],
    });
  });

  it('handles BWBV (treaty) ids', () => {
    const out = toChassisSeed({
      ...seed,
      documents: [{ ...seed.documents[0], id: 'BWBV0001506' }],
    });
    expect(out.id).toBe('nl:BWBV0001506');
  });

  it('throws on a seed with no documents (never emits an id-less statute)', () => {
    expect(() => toChassisSeed({ documents: [], provisions: [] })).toThrow(/documents/);
  });

  it('drops provisions with empty content rather than emitting empty bodies', () => {
    const out = toChassisSeed({
      ...seed,
      provisions: [
        ...seed.provisions,
        { document_id: 'BWBR0040940', provision_ref: '3', article: '3', content: '' },
      ],
    });
    expect(out.provisions.length).toBe(2);
  });
});

describe('toChassisSeed — fields the fleet translator consumes (PR #117 review fix)', () => {
  // translator-base.ts indexes provision.title into content_fts (heading-only
  // concept recall) and stores statute.status for repealed-demotion ranking.
  // Dropping them silently degrades search quality for every titled provision.
  it('forwards provision-level titles', () => {
    const out = toChassisSeed({
      ...seed,
      provisions: [
        {
          document_id: 'BWBR0040940',
          provision_ref: '1077',
          article: '1077',
          title: 'Algemene slotbepaling',
          content: 'Tekst.',
        },
      ],
    });
    expect(out.provisions[0]).toEqual({
      provision_ref: '1077',
      title: 'Algemene slotbepaling',
      content: 'Tekst.',
    });
  });

  it('omits the title key for untitled provisions', () => {
    const out = toChassisSeed(seed);
    expect('title' in out.provisions[0]).toBe(false);
  });

  it('forwards the document status', () => {
    const out = toChassisSeed(seed);
    expect(out.status).toBe('in_force');
  });
});

describe('droppedProvisionRefs', () => {
  it('names the provision refs the export filter drops, so a swap can be audited', () => {
    const refs = droppedProvisionRefs({
      ...seed,
      provisions: [
        ...seed.provisions,
        { document_id: 'BWBR0040940', provision_ref: 'XXVII', article: 'XXVII', content: '' },
        { document_id: 'BWBR0040940', provision_ref: '4', article: '4', content: '   ' },
      ],
    });
    expect(refs).toEqual(['XXVII', '4']);
  });

  it('returns an empty list when nothing is dropped', () => {
    expect(droppedProvisionRefs(seed)).toEqual([]);
  });
});
