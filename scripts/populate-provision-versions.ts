#!/usr/bin/env tsx
/**
 * Provision version populator.
 *
 * Fetches historical versions ("toestanden") of Dutch statutes from the
 * SRU search service and populates the `legal_provision_versions` table
 * in the SQLite database.
 *
 * For each statute in `legal_documents`, the script discovers all available
 * toestand URLs via the SRU API, fetches the XML for each version, parses
 * it with the BWB XML parser, and inserts the resulting provisions with
 * their validity dates.
 *
 * Usage:
 *   npm run populate:versions
 *   npm run populate:versions -- --limit 10
 *   npm run populate:versions -- --force
 */

import Database from '@ansvar/mcp-sqlite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '..', 'data', 'database.db');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SRU_BASE = 'https://zoekservice.overheid.nl/sru/Search';
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Fetch a URL with retry logic.
 */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      // Treat server errors (5xx) as retryable
      if (response.status >= 500 && attempt < retries) {
        console.warn(
          `    Attempt ${attempt}/${retries} failed with ${response.status}, retrying...`,
        );
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        console.warn(`    Attempt ${attempt}/${retries} failed: ${lastError.message}, retrying...`);
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError ?? new Error('All fetch retries exhausted');
}

// ---------------------------------------------------------------------------
// SRU version discovery
// ---------------------------------------------------------------------------

interface VersionRecord {
  toestandUrl: string;
  validFrom: string | null;
  validTo: string | null;
}

/**
 * Query the SRU service to discover all available toestand (version) URLs
 * for a given BWB-ID. Returns version records with validity dates.
 */
async function discoverVersions(bwbId: string): Promise<VersionRecord[]> {
  const url = new URL(SRU_BASE);
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('version', '1.2');
  url.searchParams.set('x-connection', 'BWB');
  url.searchParams.set('query', `dcterms.identifier=${bwbId}`);
  url.searchParams.set('maximumRecords', '100');

  const response = await fetchWithRetry(url.toString());
  const xml = await response.text();

  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const searchRetrieveResponse = doc['searchRetrieveResponse'] as
    | Record<string, unknown>
    | undefined;

  if (!searchRetrieveResponse) {
    return [];
  }

  const recordsContainer = searchRetrieveResponse['records'] as Record<string, unknown> | undefined;
  if (!recordsContainer) {
    return [];
  }

  const rawRecords = toArray(recordsContainer['record']);
  const versions: VersionRecord[] = [];

  for (const rawRecord of rawRecords) {
    if (rawRecord == null || typeof rawRecord !== 'object') continue;
    const rec = rawRecord as Record<string, unknown>;

    const recordData = rec['recordData'] as Record<string, unknown> | undefined;
    if (!recordData) continue;

    const gzd = recordData['gzd'] as Record<string, unknown> | undefined;
    if (!gzd) continue;

    // Extract toestand URL from enrichedData
    const enrichedData = gzd['enrichedData'] as Record<string, unknown> | undefined;
    const locatie = enrichedData?.['locatie_toestand'];
    if (typeof locatie !== 'string' || !locatie) continue;

    // Extract validity dates from originalData > meta > bwbipm
    const originalData = gzd['originalData'] as Record<string, unknown> | undefined;
    const meta = originalData?.['meta'] as Record<string, unknown> | undefined;
    const bwbipm = meta?.['bwbipm'] as Record<string, unknown> | undefined;

    let validFrom: string | null = null;
    let validTo: string | null = null;

    if (bwbipm) {
      const startDatum = bwbipm['geldigheidsperiode_startdatum'];
      const eindDatum = bwbipm['geldigheidsperiode_einddatum'];

      if (typeof startDatum === 'string' && startDatum) {
        validFrom = startDatum;
      }
      if (typeof eindDatum === 'string' && eindDatum) {
        validTo = eindDatum;
      }
    }

    versions.push({
      toestandUrl: locatie,
      validFrom,
      validTo,
    });
  }

  return versions;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  limit: number | null;
  force: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1], 10);
      if (isNaN(limit) || limit <= 0) {
        console.error('Error: --limit must be a positive integer');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      console.error('Usage: populate-provision-versions [--limit N] [--force]');
      process.exit(1);
    }
  }

  return { limit, force };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  console.log('=== Provision Version Populator ===');
  console.log();

  if (cliArgs.limit) console.log(`  --limit ${cliArgs.limit}`);
  if (cliArgs.force) console.log('  --force (re-processing already-versioned statutes)');
  console.log();

  // 1. Open the database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 2. Query all statutes
  const statutes = db
    .prepare(`SELECT id, title FROM legal_documents WHERE type = 'statute'`)
    .all() as Array<{ id: string; title: string }>;

  console.log(`Found ${statutes.length} statutes in the database.`);

  // Apply limit if specified
  const statutesToProcess = cliArgs.limit ? statutes.slice(0, cliArgs.limit) : statutes;
  console.log(`Will process ${statutesToProcess.length} statutes.`);
  console.log();

  // Prepare statements
  const countVersions = db.prepare(
    `SELECT COUNT(*) as count FROM legal_provision_versions WHERE document_id = ?`,
  );

  const insertProvVer = db.prepare(
    `INSERT INTO legal_provision_versions (document_id, provision_ref, book, chapter, section, article, title, content, metadata, valid_from, valid_to)
     VALUES (@document_id, @provision_ref, @book, @chapter, @section, @article, @title, @content, @metadata, @valid_from, @valid_to)`,
  );

  // Statistics
  let totalStatutesProcessed = 0;
  let totalVersionsFound = 0;
  let totalProvisionsInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const startTime = Date.now();

  for (let i = 0; i < statutesToProcess.length; i++) {
    const statute = statutesToProcess[i];
    const elapsed = Date.now() - startTime;
    const avgTimePerStatute = i > 0 ? elapsed / i : 0;
    const remaining = (statutesToProcess.length - i) * avgTimePerStatute;

    console.log(
      `[${i + 1}/${statutesToProcess.length}] ${statute.id} — ${statute.title}` +
        (i > 0 ? ` (ETA: ${formatDuration(remaining)})` : ''),
    );

    // 6. Skip statutes that already have versions (unless --force)
    if (!cliArgs.force) {
      const row = countVersions.get(statute.id) as { count: number };
      if (row.count > 0) {
        console.log(`  Already has ${row.count} version(s), skipping (use --force to re-process)`);
        totalSkipped++;
        continue;
      }
    }

    // 3. Discover all available versions via SRU
    let versions: VersionRecord[];
    try {
      versions = await discoverVersions(statute.id);
    } catch (err) {
      console.error(`  ERROR discovering versions: ${String(err)}`);
      totalErrors++;
      continue;
    }

    console.log(`  Found ${versions.length} version(s)`);
    totalVersionsFound += versions.length;

    if (versions.length === 0) {
      totalStatutesProcessed++;
      continue;
    }

    // 4. For each version, fetch XML, parse, and collect provisions
    let statuteProvisionsInserted = 0;

    // Fetch XMLs asynchronously, then insert in a transaction.
    // Collect all fetched data first, then insert in one transaction.
    interface FetchedVersion {
      version: VersionRecord;
      provisions: Array<{
        provision_ref: string;
        book?: string;
        chapter?: string;
        section?: string;
        article: string;
        title?: string;
        content: string;
      }>;
    }

    const fetchedVersions: FetchedVersion[] = [];

    for (let v = 0; v < versions.length; v++) {
      const version = versions[v];
      console.log(
        `  Version ${v + 1}/${versions.length}: ${version.validFrom ?? '?'} — ${version.validTo ?? 'present'}`,
      );

      let xml: string;
      try {
        const response = await fetchWithRetry(version.toestandUrl);
        xml = await response.text();
      } catch (err) {
        console.error(`    ERROR fetching toestand XML: ${String(err)}`);
        totalErrors++;
        continue;
      }

      let parsed: ReturnType<typeof parseBwbXml>;
      try {
        parsed = parseBwbXml(xml);
      } catch (err) {
        console.error(`    ERROR parsing toestand XML: ${String(err)}`);
        totalErrors++;
        continue;
      }

      console.log(`    Parsed ${parsed.provisions.length} provisions`);
      fetchedVersions.push({ version, provisions: parsed.provisions });

      // 5. Rate limit between requests
      if (v < versions.length - 1) {
        await sleep(RATE_LIMIT_MS);
      }
    }

    // Insert all provisions for this statute in a single transaction
    if (fetchedVersions.length > 0) {
      const insertFetched = db.transaction(() => {
        // If --force, delete existing versions for this statute first
        if (cliArgs.force) {
          db.prepare(`DELETE FROM legal_provision_versions WHERE document_id = ?`).run(statute.id);
        }

        for (const fetched of fetchedVersions) {
          for (const provision of fetched.provisions) {
            insertProvVer.run({
              document_id: statute.id,
              provision_ref: provision.provision_ref,
              book: provision.book ?? null,
              chapter: provision.chapter ?? null,
              section: provision.section ?? null,
              article: provision.article,
              title: provision.title ?? null,
              content: provision.content,
              metadata: null,
              valid_from: fetched.version.validFrom ?? null,
              valid_to: fetched.version.validTo ?? null,
            });
            statuteProvisionsInserted++;
          }
        }
      });

      insertFetched();
    }

    totalProvisionsInserted += statuteProvisionsInserted;
    totalStatutesProcessed++;

    console.log(`  Inserted ${statuteProvisionsInserted} provision version(s) total`);

    // Rate limit between statutes
    if (i < statutesToProcess.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Close database
  db.close();

  // 8. Print summary
  const totalElapsed = Date.now() - startTime;

  console.log();
  console.log('=== Summary ===');
  console.log(`  Statutes processed:    ${totalStatutesProcessed}`);
  console.log(`  Statutes skipped:      ${totalSkipped}`);
  console.log(`  Versions found:        ${totalVersionsFound}`);
  console.log(`  Provisions inserted:   ${totalProvisionsInserted}`);
  console.log(`  Errors:                ${totalErrors}`);
  console.log(`  Total time:            ${formatDuration(totalElapsed)}`);
}

main().catch((err) => {
  console.error('Fatal error during provision version population:', err);
  process.exit(1);
});
