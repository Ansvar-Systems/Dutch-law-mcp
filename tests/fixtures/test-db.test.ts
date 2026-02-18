import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from './test-db.js';
import type Database from '@ansvar/mcp-sqlite';

describe('test database fixture', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should have legal documents', () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM legal_documents').get() as { c: number };
    expect(count.c).toBeGreaterThan(0);
  });

  it('should have provisions with FTS', () => {
    const results = db
      .prepare("SELECT * FROM provisions_fts WHERE provisions_fts MATCH 'onrechtmatige'")
      .all();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should have case law with ECLI', () => {
    const row = db.prepare("SELECT * FROM case_law WHERE ecli = 'ECLI:NL:HR:2019:376'").get();
    expect(row).toBeDefined();
  });

  it('should have EU documents', () => {
    const gdpr = db.prepare("SELECT * FROM eu_documents WHERE id = 'regulation:2016/679'").get();
    expect(gdpr).toBeDefined();
  });

  it('should have EU references', () => {
    const refs = db.prepare("SELECT * FROM eu_references WHERE document_id = 'BWBR0042124'").all();
    expect(refs.length).toBeGreaterThan(0);
  });
});
