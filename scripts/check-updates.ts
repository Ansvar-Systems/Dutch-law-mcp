#!/usr/bin/env tsx
/**
 * Check for legal data updates.
 *
 * Compares local database timestamps against remote sources to detect
 * statutes that have been updated since last ingestion.
 *
 * Usage: npm run check-updates
 * Exit codes:
 *   0 - All data is up to date
 *   2 - Updates available (see output for details)
 *   1 - Error occurred
 */

import Database from '@ansvar/mcp-sqlite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DUTCH_LAW_DB_PATH ?? path.resolve(__dirname, '..', 'data', 'database.db');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 1000; // 1 request per second

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StatuteRecord {
  id: string;
  title: string;
  last_updated: string | null;
}

interface UpdateInfo {
  bwbId: string;
  title: string;
  localDate: string | null;
  remoteDate: string | null;
}

/**
 * Check the Last-Modified header for a statute at wetten.overheid.nl
 */
async function checkRemoteLastModified(bwbId: string): Promise<string | null> {
  try {
    const url = `https://wetten.overheid.nl/${bwbId}`;
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      return null;
    }

    const lastModified = response.headers.get('Last-Modified');
    return lastModified;
  } catch (err) {
    console.warn(`  WARNING: Failed to check ${bwbId}: ${err}`);
    return null;
  }
}

/**
 * Parse a Last-Modified header or ISO timestamp into a comparable Date
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Dutch Law Update Check ===');
  console.log();

  // Open database in readonly mode
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Fetch all statutes from the database
    const statutes = db.prepare<StatuteRecord, [string]>(
      `SELECT id, title, last_updated
       FROM legal_documents
       WHERE type = ?
       ORDER BY id`
    ).all('statute');

    console.log(`Checking ${statutes.length} statutes for updates...`);
    console.log();

    const updatesAvailable: UpdateInfo[] = [];
    let checkedCount = 0;

    // Check each statute
    for (const statute of statutes) {
      checkedCount++;

      // Rate limiting
      if (checkedCount > 1) {
        await sleep(RATE_LIMIT_MS);
      }

      const remoteLastModified = await checkRemoteLastModified(statute.id);

      if (!remoteLastModified) {
        // Could not fetch remote date (404, timeout, etc.) - skip
        continue;
      }

      const localDate = parseDate(statute.last_updated);
      const remoteDate = parseDate(remoteLastModified);

      if (!localDate || !remoteDate) {
        // Could not parse dates - skip comparison
        continue;
      }

      // Compare dates - if remote is newer, update is available
      if (remoteDate > localDate) {
        updatesAvailable.push({
          bwbId: statute.id,
          title: statute.title,
          localDate: statute.last_updated,
          remoteDate: remoteLastModified,
        });
      }

      // Progress indicator
      if (checkedCount % 10 === 0) {
        process.stdout.write(`  Checked ${checkedCount}/${statutes.length}...\r`);
      }
    }

    console.log(`  Checked ${checkedCount}/${statutes.length}... Done!`);
    console.log();

    // Print summary report
    console.log('=== Update Check Summary ===');
    console.log(`Statutes checked: ${checkedCount}`);
    console.log(`Updates available: ${updatesAvailable.length}`);
    console.log();

    if (updatesAvailable.length > 0) {
      console.log('Statutes needing update:');
      console.log();

      for (const update of updatesAvailable) {
        console.log(`  ${update.bwbId}`);
        console.log(`    Title: ${update.title}`);
        console.log(`    Local:  ${update.localDate ?? 'N/A'}`);
        console.log(`    Remote: ${update.remoteDate ?? 'N/A'}`);
        console.log();
      }

      console.log('Run `npm run ingest` to update the data.');
      process.exit(2); // Exit code 2: updates available
    } else {
      console.log('All statutes are up to date.');
      process.exit(0); // Exit code 0: all up to date
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('Fatal error during update check:', err);
  process.exit(1);
});
