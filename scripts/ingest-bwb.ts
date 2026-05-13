#!/usr/bin/env tsx
/**
 * BWB (Basiswettenbestand) ingestion script.
 *
 * Discovers statutes via the SRU search service at zoekservice.overheid.nl,
 * fetches the "toestand" XML for each BWB-ID, parses it with the BWB XML
 * parser, and writes seed JSON files to data/seed/.
 *
 * Usage: npm run ingest
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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SRU_BASE = 'https://zoekservice.overheid.nl/sru/Search';
const SRU_QUERY = 'dcterms.type=wet';
const SRU_PAGE_SIZE = 50;

const BWB_XML_BASE = 'https://repository.officiele-overheidspublicaties.nl/bwb';

const RATE_LIMIT_MS = 2000;

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

interface SRURecord {
  bwbId: string;
  title: string;
  toestandUrl?: string;
}

/**
 * Fetch a single page from the SRU service and return records + next position.
 */
async function fetchSRUPage(startRecord: number): Promise<{
  records: SRURecord[];
  totalRecords: number;
  nextRecordPosition: number | null;
}> {
  const url = new URL(SRU_BASE);
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('version', '1.2');
  url.searchParams.set('x-connection', 'BWB');
  url.searchParams.set('query', SRU_QUERY);
  url.searchParams.set('maximumRecords', String(SRU_PAGE_SIZE));
  url.searchParams.set('startRecord', String(startRecord));

  console.log(`  Fetching SRU page starting at record ${startRecord}...`);

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
  const searchRetrieveResponse = doc['searchRetrieveResponse'] as
    | Record<string, unknown>
    | undefined;

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

  const rawRecords = toArray(recordsContainer['record']);
  const records: SRURecord[] = [];

  for (const rawRecord of rawRecords) {
    if (rawRecord == null || typeof rawRecord !== 'object') continue;
    const rec = rawRecord as Record<string, unknown>;

    const recordData = rec['recordData'] as Record<string, unknown> | undefined;
    if (!recordData) continue;

    // Extract BWB-ID from the SRU metadata
    // Structure: recordData > gzd > originalData > meta > owmskern > identifier
    const gzd = recordData['gzd'] as Record<string, unknown> | undefined;
    const originalData = gzd?.['originalData'] as Record<string, unknown> | undefined;
    const enrichedData = gzd?.['enrichedData'] as Record<string, unknown> | undefined;

    let bwbId = '';
    let title = '';
    let toestandUrl: string | undefined;

    if (originalData) {
      // The SRU response wraps owmskern inside overheidbwb:meta (becomes 'meta' after NS removal)
      const meta = originalData['meta'] as Record<string, unknown> | undefined;
      const owmsKern = (meta?.['owmskern'] ??
        originalData['owmskern'] ??
        originalData['owms-kern']) as Record<string, unknown> | undefined;

      if (owmsKern) {
        const identifier = owmsKern['identifier'];
        if (typeof identifier === 'string') {
          const match = identifier.match(/BWB[RV]\d+/);
          if (match) bwbId = match[0];
        } else if (identifier && typeof identifier === 'object') {
          const idText = (identifier as Record<string, unknown>)['#text'];
          const idStr = typeof idText === 'string' ? idText : '';
          const match = idStr.match(/BWB[RV]\d+/);
          if (match) bwbId = match[0];
        }

        const titleNode = owmsKern['title'];
        if (typeof titleNode === 'string') {
          title = titleNode;
        } else if (titleNode && typeof titleNode === 'object') {
          const titleText = (titleNode as Record<string, unknown>)['#text'];
          title = typeof titleText === 'string' ? titleText : '';
        }
      }
    }

    // Get the toestand URL from enrichedData (has the correct date-versioned path)
    if (enrichedData) {
      const locatie = enrichedData['locatie_toestand'];
      if (typeof locatie === 'string') {
        toestandUrl = locatie;
      }

      // Fallback: extract BWB-ID from enriched data
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
 * If a toestandUrl is provided (from SRU enrichedData), use that directly.
 * Otherwise, fall back to the generic URL pattern.
 */
async function fetchAndParseBWB(
  bwbId: string,
  toestandUrl?: string,
): Promise<{
  title: string;
  in_force_date?: string;
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
      console.warn(`  WARNING: Failed to fetch XML for ${bwbId}: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const parsed = parseBwbXml(xml);

    return {
      title: parsed.title,
      in_force_date: parsed.in_force_date,
      provisions: parsed.provisions,
    };
  } catch (err) {
    console.warn(`  WARNING: Error parsing ${bwbId}: ${String(err)}`);
    return null;
  }
}

/**
 * Write a seed JSON file for a single statute.
 */
function writeSeedFile(
  bwbId: string,
  title: string,
  provisions: Array<{
    provision_ref: string;
    book?: string;
    chapter?: string;
    section?: string;
    article: string;
    title?: string;
    content: string;
  }>,
  options: { in_force_date?: string } = {},
): void {
  const seedData = {
    documents: [
      {
        id: bwbId,
        type: 'statute' as const,
        title,
        status: 'in_force',
        ...(options.in_force_date ? { in_force_date: options.in_force_date } : {}),
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== BWB Ingestion ===');
  console.log();

  // Ensure seed directory exists
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  // 1. Discover all BWB-IDs via SRU pagination
  console.log('Phase 1: Discovering statutes via SRU...');
  const allRecords: SRURecord[] = [];
  let startRecord = 1;
  let totalRecords = 0;

  while (true) {
    const page = await fetchSRUPage(startRecord);
    totalRecords = page.totalRecords;
    allRecords.push(...page.records);

    console.log(`  Found ${allRecords.length} / ${totalRecords} records`);

    if (page.nextRecordPosition == null) {
      break;
    }

    startRecord = page.nextRecordPosition;
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`Discovered ${allRecords.length} toestand records.`);

  // Deduplicate by BWB-ID, keeping the first occurrence (SRU returns multiple toestand versions per statute)
  const seenBwbIds = new Map<string, SRURecord>();
  for (const record of allRecords) {
    if (!seenBwbIds.has(record.bwbId)) {
      seenBwbIds.set(record.bwbId, record);
    }
  }
  const uniqueRecords = Array.from(seenBwbIds.values());
  console.log(`Unique statutes: ${uniqueRecords.length}`);
  console.log();

  // 2. Fetch and parse each statute
  console.log('Phase 2: Fetching and parsing statute XML...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < uniqueRecords.length; i++) {
    const record = uniqueRecords[i];
    const seedPath = path.join(SEED_DIR, `${record.bwbId}.json`);

    // Skip if seed file already exists
    if (fs.existsSync(seedPath)) {
      console.log(
        `  [${i + 1}/${uniqueRecords.length}] ${record.bwbId} — already exists, skipping`,
      );
      successCount++;
      continue;
    }

    console.log(`  [${i + 1}/${uniqueRecords.length}] ${record.bwbId} — fetching...`);

    const result = await fetchAndParseBWB(record.bwbId, record.toestandUrl);

    if (result && result.provisions.length > 0) {
      writeSeedFile(record.bwbId, result.title || record.title, result.provisions, {
        in_force_date: result.in_force_date,
      });
      console.log(`    Parsed ${result.provisions.length} provisions`);
      successCount++;
    } else if (result) {
      console.log(`    No provisions found, skipping`);
      errorCount++;
    } else {
      errorCount++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log();
  console.log('=== BWB Ingestion Complete ===');
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors:  ${errorCount}`);
}

main().catch((err) => {
  console.error('Fatal error during BWB ingestion:', err);
  process.exit(1);
});
