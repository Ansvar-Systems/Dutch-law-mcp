#!/usr/bin/env tsx
/**
 * Free-tier database builder for Dutch Law MCP server.
 *
 * SUBTRACTIVE — copies the full database, then removes case law,
 * preparatory works, and paid-tier stub tables using the native
 * sqlite3 CLI (WASM wrapper can't handle 1GB+ databases).
 *
 * Kept tables:
 *   - legal_documents (statute/amvb/regulation types only)
 *   - legal_provisions + provisions_fts
 *   - legal_provision_versions + provision_versions_fts
 *   - cross_references
 *   - definitions + definitions_fts
 *   - eu_documents + eu_references
 *   - db_metadata
 *   - case_law_sync_metadata
 *
 * Dropped tables:
 *   - case_law + case_law_fts
 *   - preparatory_works + prep_works_fts
 *   - case_law_full, preparatory_works_full
 *   - agency_guidance, agency_guidance_fts
 *
 * Usage: npm run build:db:free
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FULL_DB = path.resolve(__dirname, '..', 'data', 'database.db');
const FREE_DB = path.resolve(__dirname, '..', 'data', 'database-free.db');

function sql(dbPath: string, query: string): string {
  return execFileSync('sqlite3', [dbPath, query], {
    encoding: 'utf-8',
    timeout: 600_000,  // 10 minutes for VACUUM on large DBs
  }).trim();
}

function buildFreeTier(): void {
  console.log('Building free-tier database for Dutch Law MCP...\n');

  if (!fs.existsSync(FULL_DB)) {
    console.error(
      `ERROR: No full database found at ${FULL_DB}\n` +
      `Run 'npm run build:db' first to create the base database.`
    );
    process.exit(1);
  }

  // Verify sqlite3 is available
  try {
    execFileSync('sqlite3', ['--version'], { encoding: 'utf-8' });
  } catch {
    console.error('ERROR: sqlite3 CLI not found. Install it first.');
    process.exit(1);
  }

  const fullSize = fs.statSync(FULL_DB).size;
  console.log(`  Source: ${FULL_DB} (${(fullSize / 1024 / 1024).toFixed(1)} MB)`);

  // Copy full DB to free-tier path
  if (fs.existsSync(FREE_DB)) fs.unlinkSync(FREE_DB);
  fs.copyFileSync(FULL_DB, FREE_DB);
  // Also remove any WAL/journal files from the copy
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const f = FREE_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`  Copied to: ${FREE_DB}`);

  // Switch to DELETE journal mode (WAL can cause locking issues)
  sql(FREE_DB, 'PRAGMA journal_mode = DELETE;');
  sql(FREE_DB, 'PRAGMA foreign_keys = OFF;');

  // Get existing tables
  const tableList = sql(FREE_DB, "SELECT name FROM sqlite_master WHERE type IN ('table', 'view');");
  const existingTables = new Set(tableList.split('\n').filter(Boolean));

  // Tables to drop
  const tablesToDrop = [
    'case_law_fts', 'case_law',
    'prep_works_fts', 'preparatory_works',
    'case_law_full', 'preparatory_works_full',
    'agency_guidance_fts', 'agency_guidance',
  ];

  console.log('\n  Dropping tables:');
  for (const table of tablesToDrop) {
    if (existingTables.has(table)) {
      sql(FREE_DB, `DROP TABLE IF EXISTS "${table}";`);
      console.log(`    Dropped: ${table}`);
    } else {
      console.log(`    Skipped (not present): ${table}`);
    }
  }

  // Drop triggers for dropped tables
  const triggerList = sql(FREE_DB, "SELECT name || '|' || tbl_name FROM sqlite_master WHERE type = 'trigger';");
  const droppedTableSet = new Set(tablesToDrop);
  for (const line of triggerList.split('\n').filter(Boolean)) {
    const parts = line.split('|');
    const triggerName = parts[0];
    const tblName = parts[1];
    if (tblName && droppedTableSet.has(tblName)) {
      sql(FREE_DB, `DROP TRIGGER IF EXISTS "${triggerName}";`);
      console.log(`    Dropped trigger: ${triggerName}`);
    }
  }

  // Remove case_law and kamerstuk entries from legal_documents
  const caseLawCount = sql(FREE_DB, "SELECT COUNT(*) FROM legal_documents WHERE type = 'case_law';");
  const kamerstukCount = sql(FREE_DB, "SELECT COUNT(*) FROM legal_documents WHERE type = 'kamerstuk';");

  if (parseInt(caseLawCount) > 0) {
    // Clean up eu_references pointing to case_law documents
    if (existingTables.has('eu_references')) {
      sql(FREE_DB, "DELETE FROM eu_references WHERE source_type = 'case_law';");
      sql(FREE_DB, "DELETE FROM eu_references WHERE document_id IN (SELECT id FROM legal_documents WHERE type = 'case_law');");
    }

    // Clean up cross_references pointing to case_law documents
    if (existingTables.has('cross_references')) {
      sql(FREE_DB, `DELETE FROM cross_references WHERE source_document_id IN (SELECT id FROM legal_documents WHERE type = 'case_law') OR target_document_id IN (SELECT id FROM legal_documents WHERE type = 'case_law');`);
    }

    sql(FREE_DB, "DELETE FROM legal_documents WHERE type = 'case_law';");
    console.log(`    Removed ${parseInt(caseLawCount).toLocaleString()} case_law documents from legal_documents`);
  }

  if (parseInt(kamerstukCount) > 0) {
    sql(FREE_DB, "DELETE FROM legal_documents WHERE type = 'kamerstuk';");
    console.log(`    Removed ${parseInt(kamerstukCount).toLocaleString()} kamerstuk documents from legal_documents`);
  }

  // Ensure db_metadata table exists and update tier
  sql(FREE_DB, "CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  sql(FREE_DB, `INSERT INTO db_metadata (key, value) VALUES ('tier', 'free') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);
  sql(FREE_DB, `INSERT INTO db_metadata (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);
  sql(FREE_DB, `INSERT INTO db_metadata (key, value) VALUES ('built_at', '${new Date().toISOString()}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);
  sql(FREE_DB, `INSERT INTO db_metadata (key, value) VALUES ('builder', 'build-db-free.ts') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);

  // Report remaining data
  const docCount = sql(FREE_DB, 'SELECT COUNT(*) FROM legal_documents;');
  const provCount = sql(FREE_DB, 'SELECT COUNT(*) FROM legal_provisions;');
  console.log(`\n  Remaining data:`);
  console.log(`    Legal documents: ${parseInt(docCount).toLocaleString()}`);
  console.log(`    Provisions:      ${parseInt(provCount).toLocaleString()}`);

  if (existingTables.has('definitions')) {
    const defCount = sql(FREE_DB, 'SELECT COUNT(*) FROM definitions;');
    console.log(`    Definitions:     ${parseInt(defCount).toLocaleString()}`);
  }
  if (existingTables.has('eu_documents')) {
    const euCount = sql(FREE_DB, 'SELECT COUNT(*) FROM eu_documents;');
    console.log(`    EU documents:    ${parseInt(euCount).toLocaleString()}`);
  }

  // VACUUM to reclaim space
  console.log('\n  Running VACUUM (this may take a while)...');
  sql(FREE_DB, 'VACUUM;');
  sql(FREE_DB, 'ANALYZE;');

  const freeSize = fs.statSync(FREE_DB).size;
  const reduction = ((1 - freeSize / fullSize) * 100).toFixed(1);

  console.log(
    `\nFree-tier build complete.` +
    `\n  Size: ${(fullSize / 1024 / 1024).toFixed(1)} MB -> ${(freeSize / 1024 / 1024).toFixed(1)} MB (${reduction}% reduction)` +
    `\n  Tier: free` +
    `\n  Output: ${FREE_DB}`
  );

  // Warn if too large for Vercel
  const VERCEL_LIMIT = 250 * 1024 * 1024;
  if (freeSize > VERCEL_LIMIT) {
    console.warn(
      `\n  WARNING: Free-tier database is ${(freeSize / 1024 / 1024).toFixed(0)} MB.` +
      `\n  This may be too large for Vercel Hobby plan (512 MB /tmp limit).` +
      `\n  Consider further data trimming if deployment fails.`
    );
  }
}

buildFreeTier();
