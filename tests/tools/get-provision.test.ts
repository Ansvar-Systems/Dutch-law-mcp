import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getProvision } from '../../src/tools/get-provision.js';

describe('getProvision', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return results and metadata', async () => {
    const result = await getProvision(db, { document_id: 'BWBR0005289', provision_ref: '6:162' });
    expect(result.results).toBeDefined();
    expect(result._metadata).toBeDefined();
  });

  it('should get provision by provision_ref', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005289',
      provision_ref: '6:162',
    });
    expect(result.results).toHaveLength(1);
    const prov = result.results[0];
    expect(prov.document_id).toBe('BWBR0005289');
    expect(prov.provision_ref).toBe('6:162');
    expect(prov.book).toBe('6');
    expect(prov.article).toBe('162');
    expect(prov.title).toBe('Onrechtmatige daad');
    expect(prov.content).toContain('onrechtmatige daad');
  });

  it('should build provision_ref from book + article', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005289',
      book: '6',
      article: '162',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].provision_ref).toBe('6:162');
  });

  it('should build provision_ref from article only (flat statute)', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0001854',
      article: '287',
    });
    expect(result.results).toHaveLength(1);
    const prov = result.results[0];
    expect(prov.provision_ref).toBe('287');
    expect(prov.title).toBe('Doodslag');
  });

  it('should return all provisions for document when no ref specified', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005289',
    });
    // BW 6 has 3 provisions: 6:162, 6:163, 6:174
    expect(result.results).toHaveLength(3);
    const refs = result.results.map((r) => r.provision_ref);
    expect(refs).toContain('6:162');
    expect(refs).toContain('6:163');
    expect(refs).toContain('6:174');
  });

  it('should return empty for non-existent document', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR9999999',
      provision_ref: '1',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for non-existent provision', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005289',
      provision_ref: '99:999',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should return versioned provision with as_of_date', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005289',
      provision_ref: '6:162',
      as_of_date: '2020-01-01',
    });
    expect(result.results).toHaveLength(1);
    const prov = result.results[0];
    expect(prov.valid_from).toBe('1992-01-01');
    expect(prov.valid_to).toBeNull();
  });

  it('should not return expired provision when as_of_date is after valid_to', async () => {
    // Wbp art 1 valid_to = 2018-05-25
    const result = await getProvision(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      as_of_date: '2020-01-01',
    });
    expect(result.results).toHaveLength(0);
  });

  it('should return Wbp provision when as_of_date is before repeal', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0011823',
      provision_ref: '1',
      as_of_date: '2017-01-01',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].valid_from).toBe('2001-09-01');
  });

  it('should include document_status in result', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0001840',
      provision_ref: '1',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].document_status).toBe('in_force');
  });

  it('should get Awb provision with chapter-style ref', async () => {
    const result = await getProvision(db, {
      document_id: 'BWBR0005537',
      provision_ref: '8:1',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Beroep bij de bestuursrechter');
  });
});
