#!/usr/bin/env tsx
/**
 * Comprehensive Dutch statute ingestion script.
 *
 * Discovers ALL Dutch statutes via the SRU service (wetten, AMvBs, and
 * ministerial regulations), fetches the toestand XML for each, and creates
 * seed JSON files in data/seed/.
 *
 * Designed for bulk ingestion and comprehensive coverage. Use the --force
 * flag to re-ingest existing statutes.
 *
 * Usage:
 *   npm run ingest:all                    # Ingest all document types
 *   npm run ingest:all -- --force         # Re-ingest everything
 *   npm run ingest:all -- --limit 10      # Test mode: limit to 10 documents
 *   npm run ingest:all -- --type wet      # Only ingest wetten
 *   npm run ingest:all -- --type amvb     # Only ingest AMvBs
 *   npm run ingest:all -- --type regeling # Only ingest ministerial regulations
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const FAILURE_LOG = path.resolve(__dirname, '..', 'data', 'ingest-failures.log');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SRU_BASE = 'https://zoekservice.overheid.nl/sru/Search';
const SRU_PAGE_SIZE = 50;
const BWB_XML_BASE = 'https://repository.officiele-overheidspublicaties.nl/bwb';
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_EMPTY = 5;

// Document type mappings
const DOCUMENT_TYPES = {
  wet: 'dcterms.type=wet',
  amvb: 'dcterms.type=amvb',
  regeling: 'dcterms.type=ministeriele-regeling',
} as const;

type DocumentType = keyof typeof DOCUMENT_TYPES;

// ---------------------------------------------------------------------------
// CLI Arguments
// ---------------------------------------------------------------------------

function parseArgs(): {
  force: boolean;
  limit: number | null;
  type: DocumentType | null;
} {
  const args = process.argv.slice(2);

  const force = args.includes('--force');
  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1], 10)
    : null;

  let type: DocumentType | null = null;
  if (args.includes('--type')) {
    const typeArg = args[args.indexOf('--type') + 1];
    if (typeArg === 'wet' || typeArg === 'amvb' || typeArg === 'regeling') {
      type = typeArg;
    } else {
      console.error(`Invalid --type: ${typeArg}. Must be: wet, amvb, or regeling`);
      process.exit(1);
    }
  }

  return { force, limit, type };
}

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

function logFailure(bwbId: string, reason: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} | ${bwbId} | ${reason}\n`;
  fs.appendFileSync(FAILURE_LOG, logEntry, 'utf-8');
}

interface SRURecord {
  bwbId: string;
  title: string;
  toestandUrl?: string;
}

/**
 * Fetch a single page from the SRU service and return records + next position.
 */
async function fetchSRUPage(query: string, startRecord: number): Promise<{
  records: SRURecord[];
  totalRecords: number;
  nextRecordPosition: number | null;
}> {
  const url = new URL(SRU_BASE);
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('version', '1.2');
  url.searchParams.set('x-connection', 'BWB');
  url.searchParams.set('query', query);
  url.searchParams.set('maximumRecords', String(SRU_PAGE_SIZE));
  url.searchParams.set('startRecord', String(startRecord));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`SRU request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const searchRetrieveResponse = doc['searchRetrieveResponse'] as Record<string, unknown> | undefined;

  if (!searchRetrieveResponse) {
    return { records: [], totalRecords: 0, nextRecordPosition: null };
  }

  const totalRecords = Number(searchRetrieveResponse['numberOfRecords'] ?? 0);
  const nextPos = searchRetrieveResponse['nextRecordPosition'];
  const nextRecordPosition = nextPos != null ? Number(nextPos) : null;

  const recordsContainer = searchRetrieveResponse['records'] as Record<string, unknown> | undefined;
  if (!recordsContainer) {
    return { records: [], totalRecords, nextRecordPosition: null };
  }

  const rawRecords = toArray((recordsContainer as Record<string, unknown>)['record']);
  const records: SRURecord[] = [];

  for (const rawRecord of rawRecords) {
    if (rawRecord == null || typeof rawRecord !== 'object') continue;
    const rec = rawRecord as Record<string, unknown>;

    const recordData = rec['recordData'] as Record<string, unknown> | undefined;
    if (!recordData) continue;

    const gzd = recordData['gzd'] as Record<string, unknown> | undefined;
    const originalData = gzd?.['originalData'] as Record<string, unknown> | undefined;
    const enrichedData = gzd?.['enrichedData'] as Record<string, unknown> | undefined;

    let bwbId = '';
    let title = '';
    let toestandUrl: string | undefined;

    if (originalData) {
      const meta = originalData['meta'] as Record<string, unknown> | undefined;
      const owmsKern = (meta?.['owmskern'] ?? originalData['owmskern'] ?? originalData['owms-kern']) as Record<string, unknown> | undefined;

      if (owmsKern) {
        const identifier = owmsKern['identifier'];
        if (typeof identifier === 'string') {
          const match = identifier.match(/BWB[RV]\d+/);
          if (match) bwbId = match[0];
        } else if (identifier && typeof identifier === 'object') {
          const idStr = String((identifier as Record<string, unknown>)['#text'] ?? '');
          const match = idStr.match(/BWB[RV]\d+/);
          if (match) bwbId = match[0];
        }

        const titleNode = owmsKern['title'];
        if (typeof titleNode === 'string') {
          title = titleNode;
        } else if (titleNode && typeof titleNode === 'object') {
          title = String((titleNode as Record<string, unknown>)['#text'] ?? '');
        }
      }
    }

    if (enrichedData) {
      const locatie = enrichedData['locatie_toestand'];
      if (typeof locatie === 'string') {
        toestandUrl = locatie;
      }

      if (!bwbId) {
        const locStr = typeof locatie === 'string' ? locatie : '';
        const match = locStr.match(/BWB[RV]\d+/);
        if (match) bwbId = match[0];
      }
    }

    if (bwbId) {
      records.push({ bwbId, title, toestandUrl });
    }
  }

  return { records, totalRecords, nextRecordPosition };
}

/**
 * Fetch the toestand XML for a BWB-ID and parse it into provisions.
 */
async function fetchAndParseBWB(bwbId: string, toestandUrl?: string): Promise<{
  title: string;
  provisions: Array<{
    provision_ref: string;
    book?: string;
    chapter?: string;
    section?: string;
    article: string;
    title?: string;
    content: string;
  }>;
} | null> {
  const xmlUrl = toestandUrl ?? `${BWB_XML_BASE}/${bwbId}/xml/${bwbId}.xml`;

  try {
    const response = await fetch(xmlUrl);
    if (!response.ok) {
      logFailure(bwbId, `HTTP ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const parsed = parseBwbXml(xml);

    return {
      title: parsed.title,
      provisions: parsed.provisions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFailure(bwbId, `Parse error: ${message}`);
    return null;
  }
}

/**
 * Write a seed JSON file for a single statute.
 */
function writeSeedFile(bwbId: string, title: string, provisions: Array<{
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string;
}>): void {
  const seedData = {
    documents: [
      {
        id: bwbId,
        type: 'statute' as const,
        title,
        status: 'in_force',
        url: `https://wetten.overheid.nl/${bwbId}`,
      },
    ],
    provisions: provisions.map((p) => ({
      document_id: bwbId,
      provision_ref: p.provision_ref,
      book: p.book,
      chapter: p.chapter,
      section: p.section,
      article: p.article,
      title: p.title,
      content: p.content,
    })),
  };

  const filePath = path.join(SEED_DIR, `${bwbId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
}

/**
 * Calculate and format ETA
 */
function formatETA(processed: number, total: number, startTime: number): string {
  if (processed === 0) return 'Calculating...';

  const elapsed = Date.now() - startTime;
  const rate = processed / elapsed; // items per ms
  const remaining = total - processed;
  const etaMs = remaining / rate;

  const minutes = Math.floor(etaMs / 60000);
  const seconds = Math.floor((etaMs % 60000) / 1000);

  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { force, limit, type } = parseArgs();

  console.log('=== Comprehensive Dutch Statute Ingestion ===');
  console.log();
  console.log('Options:');
  console.log(`  Force re-ingest: ${force}`);
  console.log(`  Limit:           ${limit ?? 'unlimited'}`);
  console.log(`  Type filter:     ${type ?? 'all'}`);
  console.log();

  // Ensure directories exist
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  // Clear failure log if it exists
  if (fs.existsSync(FAILURE_LOG)) {
    fs.unlinkSync(FAILURE_LOG);
  }

  // Determine which document types to ingest
  const typesToIngest: Array<{ key: DocumentType; query: string }> = type
    ? [{ key: type, query: DOCUMENT_TYPES[type] }]
    : Object.entries(DOCUMENT_TYPES).map(([key, query]) => ({
        key: key as DocumentType,
        query,
      }));

  const allRecords: SRURecord[] = [];
  const startTime = Date.now();

  // Phase 1: Discover all documents
  console.log('Phase 1: Discovering documents via SRU...');

  for (const { key, query } of typesToIngest) {
    console.log(`  Querying: ${key} (${query})`);

    let startRecord = 1;
    let totalRecords = 0;
    let fetchedCount = 0;
    let consecutiveEmpty = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let page: Awaited<ReturnType<typeof fetchSRUPage>> | null = null;

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try {
          page = await fetchSRUPage(query, startRecord);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`    WARN: Page at record ${startRecord} failed (attempt ${retry + 1}): ${msg}`);
          if (retry < MAX_RETRIES - 1) await sleep(RATE_LIMIT_MS * 2);
        }
      }

      if (!page) {
        console.log(`    Skipping page at record ${startRecord} after ${MAX_RETRIES} retries`);
        startRecord += SRU_PAGE_SIZE;
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
          console.log(`    Stopping after ${MAX_CONSECUTIVE_EMPTY} consecutive empty/failed pages`);
          break;
        }
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      totalRecords = page.totalRecords;
      allRecords.push(...page.records);
      fetchedCount += page.records.length;

      if (page.records.length > 0) {
        consecutiveEmpty = 0;
      } else {
        consecutiveEmpty++;
      }

      console.log(`    Found ${fetchedCount} / ${totalRecords} records (page at ${startRecord})`);

      if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
        console.log(`    Stopping after ${MAX_CONSECUTIVE_EMPTY} consecutive empty pages`);
        break;
      }

      if (page.nextRecordPosition == null) {
        // If we haven't reached totalRecords yet, manually advance
        if (startRecord + SRU_PAGE_SIZE <= totalRecords) {
          startRecord += SRU_PAGE_SIZE;
        } else {
          break;
        }
      } else {
        startRecord = page.nextRecordPosition;
      }

      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`Total records discovered: ${allRecords.length}`);

  // Deduplicate by BWB-ID
  const seenBwbIds = new Map<string, SRURecord>();
  for (const record of allRecords) {
    if (!seenBwbIds.has(record.bwbId)) {
      seenBwbIds.set(record.bwbId, record);
    }
  }
  const uniqueRecords = Array.from(seenBwbIds.values());
  console.log(`Unique documents: ${uniqueRecords.length}`);
  console.log();

  // Apply limit if specified
  const recordsToProcess = limit ? uniqueRecords.slice(0, limit) : uniqueRecords;

  // Phase 2: Fetch and parse each document
  console.log(`Phase 2: Fetching and parsing XML (${recordsToProcess.length} documents)...`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const ingestStartTime = Date.now();

  for (let i = 0; i < recordsToProcess.length; i++) {
    const record = recordsToProcess[i];
    const seedPath = path.join(SEED_DIR, `${record.bwbId}.json`);
    const processed = i + 1;
    const percentage = ((processed / recordsToProcess.length) * 100).toFixed(1);
    const eta = formatETA(processed, recordsToProcess.length, ingestStartTime);

    // Skip if seed file already exists (unless --force)
    if (!force && fs.existsSync(seedPath)) {
      console.log(
        `  [${processed}/${recordsToProcess.length}] ${percentage}% | ${record.bwbId} — exists, skipping | ETA: ${eta}`
      );
      skippedCount++;
      continue;
    }

    console.log(
      `  [${processed}/${recordsToProcess.length}] ${percentage}% | ${record.bwbId} — fetching... | ETA: ${eta}`
    );

    let result: Awaited<ReturnType<typeof fetchAndParseBWB>> = null;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      result = await fetchAndParseBWB(record.bwbId, record.toestandUrl);
      if (result !== null) break;
      if (retry < MAX_RETRIES - 1) {
        console.log(`    Retrying (attempt ${retry + 2})...`);
        await sleep(RATE_LIMIT_MS);
      }
    }

    if (result && result.provisions.length > 0) {
      writeSeedFile(record.bwbId, result.title || record.title, result.provisions);
      console.log(`    Parsed ${result.provisions.length} provisions`);
      successCount++;
    } else if (result) {
      console.log(`    No provisions found, skipping`);
      skippedCount++;
    } else {
      errorCount++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log();
  console.log('=== Ingestion Complete ===');
  console.log(`  Documents processed: ${recordsToProcess.length}`);
  console.log(`  Success:             ${successCount}`);
  console.log(`  Skipped (existing):  ${skippedCount}`);
  console.log(`  Errors:              ${errorCount}`);
  console.log();

  if (errorCount > 0) {
    console.log(`Failures logged to: ${FAILURE_LOG}`);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`Total time: ${totalTime} minutes`);
}

main().catch((err) => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
