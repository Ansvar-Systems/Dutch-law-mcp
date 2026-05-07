import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';

import { closeTestDatabase, createTestDatabase } from '../fixtures/test-db.js';
import { resolveDocumentId } from '../../src/utils/document-id.js';

describe('resolveDocumentId', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('returns the BWB-ID directly for a direct ID match', () => {
    expect(resolveDocumentId(db, 'BWBR0005289')).toBe('BWBR0005289');
  });

  it('resolves abbreviation BW to the canonical Burgerlijk Wetboek BWB-ID', () => {
    expect(resolveDocumentId(db, 'BW')).toBe('BWBR0005289');
  });

  it('resolves Auteurswet to BWBR0001886, not the synthetic shorter distractor (#32)', () => {
    // Without the AUTEURSWET pin in the abbreviation map, step 4 LIKE-shortest
    // would resolve 'Auteurswet' to the distractor BWBR0099999 ('Auteurswet 2024')
    // because it has a shorter title than BWBR0001886's
    // 'Auteurswet (geconsolideerde versie 1912)'.
    expect(resolveDocumentId(db, 'Auteurswet')).toBe('BWBR0001886');
  });

  it('resolves auteurswet (lowercase) to BWBR0001886 too', () => {
    expect(resolveDocumentId(db, 'auteurswet')).toBe('BWBR0001886');
  });

  it('returns null for an unknown reference', () => {
    expect(resolveDocumentId(db, 'NoSuchStatuteExists')).toBeNull();
  });
});
