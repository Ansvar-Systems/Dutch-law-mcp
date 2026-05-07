import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { migrateAgencyGuidanceRename, prepareRuntimeDatabase } from '../../src/utils/runtime-db.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

const LEGACY_SCHEMA_SQL = `
CREATE TABLE agency_guidance (
  id INTEGER PRIMARY KEY,
  agency TEXT NOT NULL,
  document_id TEXT,
  title TEXT,
  summary TEXT,
  full_text TEXT,
  issued_date TEXT,
  url TEXT,
  related_statute_id TEXT
);
CREATE VIRTUAL TABLE agency_guidance_fts USING fts5(
  title, summary, full_text,
  content='agency_guidance',
  content_rowid='id',
  tokenize='unicode61'
);
CREATE TRIGGER agency_guidance_ai AFTER INSERT ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text)
  VALUES (new.id, new.title, new.summary, new.full_text);
END;
CREATE TRIGGER agency_guidance_ad AFTER DELETE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text)
  VALUES ('delete', old.id, old.title, old.summary, old.full_text);
END;
INSERT INTO agency_guidance (agency, title, summary, full_text)
VALUES ('tweede-kamer', 'Legacy debate transcript', 'Migration corpus row',
        'A row that existed under the legacy agency_guidance schema.');
`;

function buildLegacyAgencyGuidanceDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(LEGACY_SCHEMA_SQL);
  db.close();
}

function makeEmptySqliteDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.close();
}

describe('prepareRuntimeDatabase', () => {
  it('copies the source database into the runtime directory and clears stale lock dirs', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dutch-law-runtime-test-'));
    cleanupPaths.push(tempRoot);

    const sourcePath = path.join(tempRoot, 'source.db');
    const runtimeDir = path.join(tempRoot, 'runtime');
    makeEmptySqliteDb(sourcePath);
    fs.mkdirSync(path.join(runtimeDir, 'database.db.lock'), { recursive: true });

    const runtimePath = prepareRuntimeDatabase(sourcePath, { runtimeDir });

    expect(runtimePath).toBe(path.join(runtimeDir, 'database.db'));
    expect(fs.existsSync(runtimePath)).toBe(true);
    expect(fs.existsSync(`${runtimePath}.lock`)).toBe(false);
  });
});

describe('migrateAgencyGuidanceRename (#54)', () => {
  it('renames legacy agency_guidance to parliamentary_proceedings, preserving rows', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dutch-law-migrate-test-'));
    cleanupPaths.push(tempRoot);
    const dbPath = path.join(tempRoot, 'legacy.db');
    buildLegacyAgencyGuidanceDb(dbPath);

    migrateAgencyGuidanceRename(dbPath);

    const db = new Database(dbPath);
    try {
      const legacyTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agency_guidance'")
        .get();
      expect(legacyTable).toBeUndefined();

      const newTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='parliamentary_proceedings'",
        )
        .get();
      expect(newTable).toBeDefined();

      const ftsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE name='parliamentary_proceedings_fts'")
        .get();
      expect(ftsTable).toBeDefined();

      const rowCount = db.prepare('SELECT COUNT(*) as c FROM parliamentary_proceedings').get() as {
        c: number;
      };
      expect(rowCount.c).toBe(1);

      const ftsHit = db
        .prepare(
          'SELECT rowid FROM parliamentary_proceedings_fts WHERE parliamentary_proceedings_fts MATCH ?',
        )
        .all('legacy debate') as { rowid: number }[];
      expect(ftsHit.length).toBe(1);
    } finally {
      db.close();
    }
  });

  it('is a no-op when agency_guidance is absent (idempotent)', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dutch-law-migrate-test-'));
    cleanupPaths.push(tempRoot);
    const dbPath = path.join(tempRoot, 'fresh.db');
    makeEmptySqliteDb(dbPath);

    expect(() => migrateAgencyGuidanceRename(dbPath)).not.toThrow();

    const db = new Database(dbPath);
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];
      expect(tables.find((t) => t.name === 'parliamentary_proceedings')).toBeUndefined();
      expect(tables.find((t) => t.name === 'agency_guidance')).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('is safe to run twice on the same legacy DB', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dutch-law-migrate-test-'));
    cleanupPaths.push(tempRoot);
    const dbPath = path.join(tempRoot, 'legacy.db');
    buildLegacyAgencyGuidanceDb(dbPath);

    migrateAgencyGuidanceRename(dbPath);
    expect(() => migrateAgencyGuidanceRename(dbPath)).not.toThrow();

    const db = new Database(dbPath);
    try {
      const rowCount = db.prepare('SELECT COUNT(*) as c FROM parliamentary_proceedings').get() as {
        c: number;
      };
      expect(rowCount.c).toBe(1);
    } finally {
      db.close();
    }
  });
});
