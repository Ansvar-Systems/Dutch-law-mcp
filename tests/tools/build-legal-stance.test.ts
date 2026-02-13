import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { buildLegalStance, type BuildLegalStanceInput } from '../../src/tools/build-legal-stance.js';

describe('buildLegalStance', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => { db = createTestDatabase(); });
  afterAll(() => { closeTestDatabase(db); });

  it('should return results and metadata', async () => {
    const result = await buildLegalStance(db, { query: 'onrechtmatige daad' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
  });

  it('should aggregate provisions and case law', async () => {
    const result = await buildLegalStance(db, { query: 'onrechtmatige daad' });
    expect(result.results.query).toBe('onrechtmatige daad');
    expect(result.results.provisions.length).toBeGreaterThan(0);
    expect(result.results.case_law.length).toBeGreaterThan(0);
  });

  it('should include cross references', async () => {
    const result = await buildLegalStance(db, { query: 'onrechtmatige daad' });
    // BW 6:162 is referenced by ECLI:NL:HR:2019:376 in cross_references
    expect(result.results.cross_references.length).toBeGreaterThan(0);
  });

  it('should include preparatory works when available', async () => {
    // Search for something in UAVG which has preparatory works
    const result = await buildLegalStance(db, { query: 'persoonsgegevens verordening' });
    if (result.results.provisions.some(p => p.document_id === 'BWBR0042124')) {
      expect(result.results.preparatory_works.length).toBeGreaterThan(0);
    }
  });

  it('should return empty arrays for unmatched query', async () => {
    const result = await buildLegalStance(db, { query: 'xyznonexistent' });
    expect(result.results.provisions).toHaveLength(0);
    expect(result.results.case_law).toHaveLength(0);
    expect(result.results.preparatory_works).toHaveLength(0);
    expect(result.results.cross_references).toHaveLength(0);
  });

  it('should filter provisions by document_id', async () => {
    const result = await buildLegalStance(db, {
      query: 'onrechtmatige',
      document_id: 'BWBR0005289',
    });
    for (const p of result.results.provisions) {
      expect(p.document_id).toBe('BWBR0005289');
    }
  });

  it('should respect limit', async () => {
    const result = await buildLegalStance(db, {
      query: 'de',
      limit: 2,
    });
    expect(result.results.provisions.length).toBeLessThanOrEqual(2);
    expect(result.results.case_law.length).toBeLessThanOrEqual(2);
  });

  it('should support as_of_date filtering', async () => {
    const result = await buildLegalStance(db, {
      query: 'onrechtmatige',
      as_of_date: '2020-01-01',
    });
    expect(result.results.provisions.length).toBeGreaterThan(0);
  });

  it('should include the query in the result', async () => {
    const query = 'bestuursrecht handhaving';
    const result = await buildLegalStance(db, { query });
    expect(result.results.query).toBe(query);
  });
});
