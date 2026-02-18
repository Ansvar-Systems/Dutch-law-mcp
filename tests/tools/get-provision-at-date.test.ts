import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import {
  getProvisionAtDate,
  getCurrentProvision,
  getAllVersions,
  diffProvisionDates,
} from '../../src/tools/get-provision-at-date.js';

describe('getProvisionAtDate', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '30',
      date: '2020-01-01',
    });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
    expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
  });

  it('should return current version for date within validity range', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '30',
      date: '2020-01-01',
    });
    expect(result.results.status).toBe('current');
    expect(result.results.provision_ref).toBe('30');
    expect(result.results.article).toBe('30');
    expect(result.results.title).toBe('Autoriteit Persoonsgegevens');
    expect(result.results.content).toContain('toezichthoudende autoriteit');
    expect(result.results.valid_from).toBe('2018-05-25');
    expect(result.results.valid_to).toBeNull();
  });

  it('should return not_found for non-existent provision', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '999',
      date: '2020-01-01',
    });
    expect(result.results.status).toBe('not_found');
    expect(result.results.content).toBe('');
    expect(result.results.title).toBeNull();
  });

  it('should return historical for expired provision', async () => {
    // Wbp art 1 valid_to = 2018-05-25
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      date: '2017-01-01',
    });
    expect(result.results.status).toBe('historical');
    expect(result.results.provision_ref).toBe('1');
    expect(result.results.title).toBe('Begripsbepalingen');
    expect(result.results.valid_from).toBe('2001-09-01');
    expect(result.results.valid_to).toBe('2018-05-25');
  });

  it('should return future if queried date is before valid_from', async () => {
    // UAVG art 30 valid_from = 2018-05-25
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '30',
      date: '2017-01-01',
    });
    expect(result.results.status).toBe('future');
    expect(result.results.valid_from).toBe('2018-05-25');
  });

  it('should not return provision when date is after valid_to', async () => {
    // Wbp art 1 expired on 2018-05-25
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      date: '2020-01-01',
    });
    expect(result.results.status).toBe('not_found');
  });

  it('should return BW 6:162 as current', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0005289',
      provision_ref: '6:162',
      date: '2020-01-01',
    });
    expect(result.results.status).toBe('current');
    expect(result.results.book).toBe('6');
    expect(result.results.article).toBe('162');
    expect(result.results.title).toBe('Onrechtmatige daad');
    expect(result.results.content).toContain('onrechtmatige daad');
  });

  it('should include amendments when requested', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '30',
      date: '2020-01-01',
      include_amendments: true,
    });
    expect(result.results.amendments).toBeDefined();
    expect(Array.isArray(result.results.amendments)).toBe(true);
  });

  it('should not include amendments when not requested', async () => {
    const result = await getProvisionAtDate(db, {
      document_id: 'BWBR0042124',
      provision_ref: '30',
      date: '2020-01-01',
    });
    expect(result.results.amendments).toBeUndefined();
  });

  it('should throw on invalid date format', async () => {
    await expect(
      getProvisionAtDate(db, {
        document_id: 'BWBR0042124',
        provision_ref: '30',
        date: 'invalid-date',
      }),
    ).rejects.toThrow('as_of_date must be an ISO date in YYYY-MM-DD format');
  });

  it('should throw on missing date', async () => {
    await expect(
      getProvisionAtDate(db, {
        document_id: 'BWBR0042124',
        provision_ref: '30',
        date: '',
      }),
    ).rejects.toThrow('date parameter is required');
  });
});

describe('getCurrentProvision', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return current version (today)', async () => {
    const result = await getCurrentProvision(db, 'BWBR0042124', '30');
    expect(result.results.status).toBe('current');
    expect(result.results.provision_ref).toBe('30');
    expect(result.results.valid_from).toBe('2018-05-25');
  });

  it('should return not_found for non-existent provision', async () => {
    const result = await getCurrentProvision(db, 'BWBR9999999', '999');
    expect(result.results.status).toBe('not_found');
  });
});

describe('getAllVersions', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return all versions sorted by valid_from', async () => {
    const result = await getAllVersions(db, 'BWBR0042124', '30');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].provision_ref).toBe('30');
    expect(result.results[0].valid_from).toBe('2018-05-25');
  });

  it('should return empty array for non-existent provision', async () => {
    const result = await getAllVersions(db, 'BWBR0042124', '999');
    expect(result.results).toHaveLength(0);
  });

  it('should return versions in chronological order', async () => {
    // BW 6:162 only has one version in test data
    const result = await getAllVersions(db, 'BWBR0005289', '6:162');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].valid_from).toBe('1992-01-01');
  });

  it('should include status for each version', async () => {
    const result = await getAllVersions(db, 'BWBR0011823', '1');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('historical');
  });
});

describe('diffProvisionDates', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should detect no changes when same version', async () => {
    const result = await diffProvisionDates(db, 'BWBR0042124', '30', '2020-01-01', '2021-01-01');
    expect(result.results.changed).toBe(false);
    expect(result.results.version1.content).toBe(result.results.version2.content);
  });

  it('should detect changes between different versions', async () => {
    // Compare before and after Wbp expiry
    const result = await diffProvisionDates(db, 'BWBR0011823', '1', '2017-01-01', '2020-01-01');
    expect(result.results.changed).toBe(true);
    expect(result.results.version1.status).toBe('historical');
    expect(result.results.version2.status).toBe('not_found');
  });

  it('should return both versions', async () => {
    const result = await diffProvisionDates(db, 'BWBR0042124', '30', '2019-01-01', '2020-01-01');
    expect(result.results.version1).toBeDefined();
    expect(result.results.version2).toBeDefined();
    expect(result.results.version1.provision_ref).toBe('30');
    expect(result.results.version2.provision_ref).toBe('30');
  });

  it('should throw on invalid date format', async () => {
    await expect(
      diffProvisionDates(db, 'BWBR0042124', '30', 'invalid', '2020-01-01'),
    ).rejects.toThrow('as_of_date must be an ISO date in YYYY-MM-DD format');
  });

  it('should detect future status change', async () => {
    const result = await diffProvisionDates(db, 'BWBR0042124', '30', '2017-01-01', '2020-01-01');
    expect(result.results.version1.status).toBe('future');
    expect(result.results.version2.status).toBe('current');
    expect(result.results.changed).toBe(false); // Same content, just different status
  });
});
