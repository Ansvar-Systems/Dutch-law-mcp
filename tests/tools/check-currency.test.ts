import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { checkCurrency } from '../../src/tools/check-currency.js';

describe('checkCurrency', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0005289' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
  });

  it('should confirm in_force statute is current', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0005289' });
    expect(result.results.is_current).toBe(true);
    expect(result.results.status).toBe('in_force');
    expect(result.results.document_title).toContain('Burgerlijk Wetboek');
    expect(result.results.warnings).toHaveLength(0);
  });

  it('should detect repealed statute', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0011823' });
    expect(result.results.is_current).toBe(false);
    expect(result.results.status).toBe('repealed');
    expect(result.results.warnings.some((w) => w.includes('ingetrokken'))).toBe(true);
  });

  it('should extract repeal date from description', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0011823' });
    // Description: "Ingetrokken 2018-05-25 door UAVG"
    expect(result.results.repeal_date).toBe('2018-05-25');
  });

  it('should handle non-existent document', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR9999999' });
    expect(result.results.is_current).toBe(false);
    expect(result.results.status).toBe('not_found');
    expect(result.results.warnings.some((w) => w.includes('not found'))).toBe(true);
  });

  it('should check provision version validity', async () => {
    const result = await checkCurrency(db, {
      document_id: 'BWBR0005289',
      provision_ref: '6:162',
      as_of_date: '2020-01-01',
    });
    expect(result.results.is_current).toBe(true);
    expect(result.results.provision_valid_from).toBe('1992-01-01');
    expect(result.results.provision_valid_to).toBeNull();
  });

  it('should detect expired provision', async () => {
    const result = await checkCurrency(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      as_of_date: '2020-01-01',
    });
    // Wbp is repealed + provision expired — should not be current
    expect(result.results.is_current).toBe(false);
  });

  it('should detect provision valid before repeal', async () => {
    const result = await checkCurrency(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      as_of_date: '2017-01-01',
    });
    // Wbp is repealed but as_of_date 2017 is before repeal (2018-05-25)
    // The document status is still 'repealed' in the DB, so is_current will be false
    // But the provision version exists for this date
    expect(result.results.provision_valid_from).toBe('2001-09-01');
  });

  it('should warn when as_of_date is before in_force_date', async () => {
    const result = await checkCurrency(db, {
      document_id: 'BWBR0042124',
      as_of_date: '2017-01-01',
    });
    // UAVG in_force_date = 2018-05-25
    expect(result.results.is_current).toBe(false);
    expect(result.results.warnings.some((w) => w.includes('before the in-force date'))).toBe(true);
  });

  it('should include related case law via cross references', async () => {
    const result = await checkCurrency(db, {
      document_id: 'BWBR0005289',
      provision_ref: '6:162',
    });
    // ECLI:NL:HR:2019:376 references BWBR0005289:6:162
    expect(result.results.related_case_law.length).toBeGreaterThan(0);
    expect(result.results.related_case_law[0].ecli).toBe('ECLI:NL:HR:2019:376');
  });

  it('should use today as default as_of_date', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0005289' });
    const today = new Date().toISOString().slice(0, 10);
    expect(result.results.as_of_date).toBe(today);
  });

  it('should include in_force_date in result', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0042124' });
    expect(result.results.in_force_date).toBe('2018-05-25');
  });

  it('should set provision_ref to null when not provided', async () => {
    const result = await checkCurrency(db, { document_id: 'BWBR0005289' });
    expect(result.results.provision_ref).toBeNull();
  });
});
