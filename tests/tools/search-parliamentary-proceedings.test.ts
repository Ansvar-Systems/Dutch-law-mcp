import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchParliamentaryProceedings } from '../../src/tools/search-parliamentary-proceedings.js';

describe('searchParliamentaryProceedings', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'privacy' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
    expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
  });

  it('should find proceedings by FTS query', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'persoonsgegevens' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.title).toContain('KathalijneBuitenweg');
  });

  it('should find proceedings about toeslagenaffaire', async () => {
    const result = await searchParliamentaryProceedings(db, {
      query: 'kinderopvangtoeslag fraudeur',
    });
    expect(result.results.length).toBeGreaterThan(0);
    const match = result.results.find((r) => r.title.includes('PieterOmtzigt'));
    expect(match).toBeDefined();
  });

  it('should filter by date range', async () => {
    const result = await searchParliamentaryProceedings(db, {
      query: 'privacy',
      date_from: '2020-01-01',
      date_to: '2020-12-31',
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.issued_date! >= '2020-01-01').toBe(true);
      expect(r.issued_date! <= '2020-12-31').toBe(true);
    }
  });

  it('should return empty for date range with no matches', async () => {
    const result = await searchParliamentaryProceedings(db, {
      query: 'privacy',
      date_from: '2025-01-01',
      date_to: '2025-12-31',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for unmatched query', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'xyznonexistent' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for empty query', async () => {
    const result = await searchParliamentaryProceedings(db, { query: '' });
    expect(result.results).toHaveLength(0);
  });

  it('should reject stopword-only queries with tooBroad note', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'de het een' });
    expect(result.results).toHaveLength(0);
    expect(result._metadata.note).toContain('too broad');
  });

  it('should respect limit', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'privacy', limit: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it('should include snippet and relevance from FTS', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'grondrecht' });
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.snippet).toBeDefined();
    expect(first.relevance).toBeDefined();
  });

  it('should include related_statute_id when present', async () => {
    const result = await searchParliamentaryProceedings(db, { query: 'persoonsgegevens' });
    const withStatute = result.results.find((r) => r.related_statute_id != null);
    expect(withStatute).toBeDefined();
    expect(withStatute!.related_statute_id).toBe('BWBR0042124');
  });
});
