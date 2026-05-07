import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchLegislation } from '../../src/tools/search-legislation.js';

describe('searchLegislation', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige daad' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
    expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
  });

  it('should attach non-empty citation metadata to each result', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige daad' });
    expect(result.results.length).toBeGreaterThan(0);

    for (const row of result.results) {
      expect(row._citation?.canonical_ref).toBeTruthy();
      expect(row._citation?.display_text).toBeTruthy();
      expect(row._citation?.article).toBeTruthy();
      expect(row._citation?.source).toBeTruthy();
      expect(row._citation?.source_url).toMatch(/^https:\/\/wetten\.overheid\.nl\//);
      expect(row._citation?.publisher).toBe('Dutch Government (wetten.overheid.nl)');
      expect(row._citation?.license).toBe('Public-Domain');
      expect(row._citation?.lookup.tool).toBe('get_provision');
    }
  });

  it('should find provisions matching FTS query', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige daad' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.document_id).toBe('BWBR0005289');
    expect(first.provision_ref).toBe('6:162');
    expect(first.book).toBe('6');
  });

  it('should filter by document_id', async () => {
    const result = await searchLegislation(db, {
      query: 'onrechtmatige',
      document_id: 'BWBR0005289',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.document_id).toBe('BWBR0005289');
    }
  });

  it('should filter by status', async () => {
    const result = await searchLegislation(db, {
      query: 'persoonsgegeven',
      status: 'repealed',
    });
    // Wbp is repealed and has "persoonsgegeven" in content
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.document_id).toBe('BWBR0011823');
    }
  });

  it('should return empty for unmatched query', async () => {
    const result = await searchLegislation(db, { query: 'xyznonexistent' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for empty query', async () => {
    const result = await searchLegislation(db, { query: '' });
    expect(result.results).toHaveLength(0);
  });

  it('should respect limit', async () => {
    const result = await searchLegislation(db, { query: 'de', limit: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it('should search versioned provisions with as_of_date', async () => {
    const result = await searchLegislation(db, {
      query: 'onrechtmatige',
      as_of_date: '2020-01-01',
    });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.valid_from).toBeDefined();
  });

  it('should exclude expired provisions with as_of_date', async () => {
    // Wbp art 1 expired 2018-05-25, so searching after that date should not find it
    const result = await searchLegislation(db, {
      query: 'persoonsgegeven',
      as_of_date: '2020-01-01',
      document_id: 'BWBR0011823',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should include provisions in Wbp when as_of_date is before repeal', async () => {
    const result = await searchLegislation(db, {
      query: 'persoonsgegeven',
      as_of_date: '2017-01-01',
      document_id: 'BWBR0011823',
    });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should return snippet and relevance in results', async () => {
    const result = await searchLegislation(db, { query: 'doodslag' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.snippet).toBeDefined();
    expect(first.relevance).toBeDefined();
    expect(typeof first.relevance).toBe('number');
  });

  it('should find Criminal Code provisions', async () => {
    const result = await searchLegislation(db, { query: 'diefstal' });
    expect(result.results.length).toBeGreaterThan(0);
    const match = result.results.find((r) => r.provision_ref === '310');
    expect(match).toBeDefined();
    expect(match!.document_id).toBe('BWBR0001854');
    expect(match!.book).toBeNull();
  });
});
