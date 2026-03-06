import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getPreparatoryWorks } from '../../src/tools/get-preparatory-works.js';

describe('getPreparatoryWorks', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await getPreparatoryWorks(db, { statute_id: 'BWBR0042124' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
  });

  it('should find preparatory works for UAVG', async () => {
    const result = await getPreparatoryWorks(db, { statute_id: 'BWBR0042124' });
    expect(result.results).toHaveLength(1);
    const pw = result.results[0];
    expect(pw.statute_id).toBe('BWBR0042124');
    expect(pw.prep_document_id).toBe('KST-35815-2');
    expect(pw.kamerstuk_ref).toBe('Kamerstukken II 2020/21, 35815, nr. 2');
    expect(pw.document_type).toBe('MvT');
    expect(pw.statute_title).toContain('Uitvoeringswet');
  });

  it('should return empty for statute without preparatory works', async () => {
    const result = await getPreparatoryWorks(db, { statute_id: 'BWBR0005289' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for non-existent statute', async () => {
    const result = await getPreparatoryWorks(db, { statute_id: 'BWBR9999999' });
    expect(result.results).toHaveLength(0);
  });

  it('should filter by document_type', async () => {
    const result = await getPreparatoryWorks(db, {
      statute_id: 'BWBR0042124',
      document_type: 'MvT',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].document_type).toBe('MvT');
  });

  it('should return empty when document_type filter does not match', async () => {
    const result = await getPreparatoryWorks(db, {
      statute_id: 'BWBR0042124',
      document_type: 'MvA',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should respect limit', async () => {
    const result = await getPreparatoryWorks(db, {
      statute_id: 'BWBR0042124',
      limit: 1,
    });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it('should include summary and title', async () => {
    const result = await getPreparatoryWorks(db, { statute_id: 'BWBR0042124' });
    const pw = result.results[0];
    expect(pw.title).toContain('Wijziging');
    expect(pw.summary).toContain('Memorie van Toelichting');
  });
});
