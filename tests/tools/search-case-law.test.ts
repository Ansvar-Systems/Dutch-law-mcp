import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchCaseLaw } from '../../src/tools/search-case-law.js';

describe('searchCaseLaw', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await searchCaseLaw(db, { query: 'onrechtmatige daad' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
    expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
  });

  it('should attach non-empty citation metadata to each result', async () => {
    const result = await searchCaseLaw(db, { query: 'onrechtmatige daad' });
    expect(result.results.length).toBeGreaterThan(0);

    for (const row of result.results) {
      expect(row._citation?.canonical_ref).toBeTruthy();
      expect(row._citation?.canonical_ref).toContain('ECLI:');
      expect(row._citation?.article).toBeTruthy();
      expect(row._citation?.source).toBeTruthy();
      expect(row._citation?.source_url).toMatch(/^https:\/\/uitspraken\.rechtspraak\.nl\//);
      expect(row._citation?.publisher).toBe('De Rechtspraak (Dutch Judiciary)');
      expect(row._citation?.license).toBe('Public-Domain');
      expect(row._citation?.lookup.tool).toBe('search_case_law');
    }
  });

  it('should find case law by FTS query', async () => {
    const result = await searchCaseLaw(db, { query: 'onrechtmatige daad' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.ecli).toBe('ECLI:NL:HR:2019:376');
    expect(first.court).toBe('HR');
  });

  it('should do direct lookup by ECLI', async () => {
    const result = await searchCaseLaw(db, {
      query: '',
      ecli: 'ECLI:NL:HR:2019:376',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].ecli).toBe('ECLI:NL:HR:2019:376');
    expect(result.results[0].court).toBe('HR');
    expect(result.results[0].legal_domain).toBe('Civiel recht');
  });

  it('should return empty for non-existent ECLI', async () => {
    const result = await searchCaseLaw(db, {
      query: '',
      ecli: 'ECLI:NL:HR:2099:999',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should filter by court', async () => {
    const result = await searchCaseLaw(db, {
      query: 'bestuursrecht',
      court: 'RVS',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.court).toBe('RVS');
    }
  });

  it('should filter by legal_domain', async () => {
    const result = await searchCaseLaw(db, {
      query: 'handhaving',
      legal_domain: 'Bestuursrecht',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.legal_domain).toBe('Bestuursrecht');
    }
  });

  it('should filter by procedure_type', async () => {
    const result = await searchCaseLaw(db, {
      query: 'aansprakelijkheid',
      procedure_type: 'Cassatie',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.procedure_type).toBe('Cassatie');
    }
  });

  it('should filter by date range', async () => {
    const result = await searchCaseLaw(db, {
      query: 'onrechtmatige',
      date_from: '2019-01-01',
      date_to: '2019-12-31',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.decision_date! >= '2019-01-01').toBe(true);
      expect(r.decision_date! <= '2019-12-31').toBe(true);
    }
  });

  it('should return empty for unmatched query', async () => {
    const result = await searchCaseLaw(db, { query: 'xyznonexistent' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for empty query without ecli', async () => {
    const result = await searchCaseLaw(db, { query: '' });
    expect(result.results).toHaveLength(0);
  });

  it('should respect limit', async () => {
    const result = await searchCaseLaw(db, { query: 'de', limit: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it('should include snippet and relevance from FTS', async () => {
    const result = await searchCaseLaw(db, { query: 'schadevergoeding' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.snippet).toBeDefined();
    expect(first.relevance).toBeDefined();
  });

  it('should find RVS case law about bestuursrecht', async () => {
    const result = await searchCaseLaw(db, { query: 'bestuursorgaan' });
    expect(result.results.length).toBeGreaterThan(0);
    const rvs = result.results.find((r) => r.court === 'RVS');
    expect(rvs).toBeDefined();
    expect(rvs!.ecli).toBe('ECLI:NL:RVS:2020:1234');
  });
});
