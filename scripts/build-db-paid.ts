#!/usr/bin/env tsx
/**
 * Paid-tier database builder for Dutch Law MCP server.
 *
 * ADDITIVE — does NOT rebuild from scratch. Instead:
 *   1. Verifies a base (free-tier) database exists
 *   2. Adds paid-only tables and schema extensions
 *   3. Updates db_metadata to reflect the professional tier
 *
 * The full build pipeline for paid tier is:
 *   npm run build:db                        # Step 1: Build base from seeds
 *   npm run ingest:cases                    # Step 2: Ingest case law (slow, network)
 *   npm run build:db:paid                   # Step 3: Add paid tables + metadata
 *
 * Usage: npm run build:db:paid
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// Paid-tier schema extensions
// ─────────────────────────────────────────────────────────────────────────────

const PAID_SCHEMA = `
-- Extended case law with full-text opinions (paid tier)
CREATE TABLE IF NOT EXISTS case_law_full (
  id INTEGER PRIMARY KEY,
  case_law_id INTEGER NOT NULL REFERENCES case_law(id),
  full_text TEXT NOT NULL,
  headnotes TEXT,
  dissenting_opinions TEXT,
  UNIQUE(case_law_id)
);

CREATE INDEX IF NOT EXISTS idx_case_law_full_case
  ON case_law_full(case_law_id);

-- Extended preparatory works with full-text (paid tier)
CREATE TABLE IF NOT EXISTS preparatory_works_full (
  id INTEGER PRIMARY KEY,
  prep_work_id INTEGER NOT NULL REFERENCES preparatory_works(id),
  full_text TEXT NOT NULL,
  section_summaries TEXT,
  UNIQUE(prep_work_id)
);

CREATE INDEX IF NOT EXISTS idx_prep_works_full_prep
  ON preparatory_works_full(prep_work_id);

-- Agency guidance documents (paid tier)
CREATE TABLE IF NOT EXISTS agency_guidance (
  id INTEGER PRIMARY KEY,
  agency TEXT NOT NULL,
  document_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  issued_date TEXT,
  url TEXT,
  related_statute_id TEXT REFERENCES legal_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_agency_guidance_agency
  ON agency_guidance(agency);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_statute
  ON agency_guidance(related_statute_id);

-- FTS5 for agency guidance search
CREATE VIRTUAL TABLE IF NOT EXISTS agency_guidance_fts USING fts5(
  title, summary, full_text,
  content='agency_guidance',
  content_rowid='id',
  tokenize='unicode61'
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function buildPaidTier(): void {
  console.log('Building paid-tier extensions for Dutch Law MCP...\n');

  // Verify base database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(
      `ERROR: No base database found at ${DB_PATH}\n` +
      `Run 'npm run build:db' first to create the base database from seeds.`
    );
    process.exit(1);
  }

  const sizeBefore = fs.statSync(DB_PATH).size;
  console.log(`  Base database: ${DB_PATH} (${(sizeBefore / 1024 / 1024).toFixed(1)} MB)`);

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Verify base schema exists
  const hasLegalDocs = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='legal_documents'"
  ).get();

  if (!hasLegalDocs) {
    console.error('ERROR: Base database is missing legal_documents table. Rebuild with: npm run build:db');
    db.close();
    process.exit(1);
  }

  // Create db_metadata table if it doesn't exist (for databases built before metadata was added)
  const createMetaSQL = `CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  db.prepare(createMetaSQL).run();

  // Add paid-tier tables
  console.log('  Adding paid-tier schema extensions...');
  db.exec(PAID_SCHEMA);

  // Report what's available
  const caseCount = (db.prepare('SELECT COUNT(*) as c FROM case_law').get() as { c: number }).c;
  const provisionCount = (db.prepare('SELECT COUNT(*) as c FROM legal_provisions').get() as { c: number }).c;
  const prepCount = (db.prepare('SELECT COUNT(*) as c FROM preparatory_works').get() as { c: number }).c;

  console.log(`\n  Base data available:`);
  console.log(`    Provisions:        ${provisionCount.toLocaleString()}`);
  console.log(`    Case law entries:  ${caseCount.toLocaleString()}`);
  console.log(`    Preparatory works: ${prepCount.toLocaleString()}`);

  // Check paid tables for data
  const paidTables = ['case_law_full', 'preparatory_works_full', 'agency_guidance'];
  console.log(`\n  Paid-tier tables (stub — no data sources connected yet):`);
  for (const table of paidTables) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
    console.log(`    ${table}: ${row.c} rows`);
  }

  // Update metadata to professional tier
  const upsertMeta = db.prepare(`
    INSERT INTO db_metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const updateMeta = db.transaction(() => {
    upsertMeta.run('tier', 'professional');
    upsertMeta.run('schema_version', '2');
    upsertMeta.run('built_at', new Date().toISOString());
    upsertMeta.run('builder', 'build-db-paid.ts');
    upsertMeta.run('paid_tables', paidTables.join(','));
  });
  updateMeta();

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('ANALYZE');
  db.close();

  const sizeAfter = fs.statSync(DB_PATH).size;
  console.log(
    `\nPaid-tier build complete.` +
    `\n  Size: ${(sizeBefore / 1024 / 1024).toFixed(1)} MB -> ${(sizeAfter / 1024 / 1024).toFixed(1)} MB` +
    `\n  Tier: professional` +
    `\n  Output: ${DB_PATH}`
  );

  console.log(`\n  NOTE: Paid-tier tables are empty stubs. To populate them:`);
  console.log(`    1. case_law_full -- needs full-text opinion source from rechtspraak.nl (future)`);
  console.log(`    2. preparatory_works_full -- needs Kamerstukken full-text API (future)`);
  console.log(`    3. agency_guidance -- needs agency document scrapers (future)`);
}

buildPaidTier();
