#!/usr/bin/env tsx
/**
 * Preparatory works (kamerstukken) ingestion script.
 *
 * Fetches parliamentary documents from officielebekendmakingen.nl and
 * links them to the corresponding statutes in seed files.
 *
 * Usage: npm run ingest:prep-works
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

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
const SRU_QUERY = 'dcterms.type=Kamerstuk';
const SRU_PAGE_SIZE = 100;

const RATE_LIMIT_MS = 500;
const MAX_BATCHES = 50; // Limit to prevent runaway ingestion

// Document type mapping from metadata to standardized types
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'memorie van toelichting': 'memorie_van_toelichting',
  'nota naar aanleiding van het verslag': 'nota_nav_verslag',
  'nota van wijziging': 'nota_van_wijziging',
  'amendement': 'amendement',
  'advies raad van state': 'advies_raad_van_state',
  'voorstel van wet': 'voorstel_van_wet',
  'tweede nota van wijziging': 'tweede_nota_van_wijziging',
  'brief': 'brief',
  'verslag': 'verslag',
  'eindverslag': 'eindverslag',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']);
  }
  return '';
}

interface KamerstukRecord {
  id: string;
  title: string;
  dossiernummer: string;
  ondernummer: string;
  kamerstukRef: string;
  documentType: string;
  date: string;
  summary: string;
  relatedBwbIds: string[];
  url: string;
}

/**
 * Extract BWB identifiers from metadata fields.
 */
function extractBwbIds(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/BWB[RV]\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Normalize document type from metadata.
 */
function normalizeDocumentType(typeText: string): string {
  const normalized = typeText.toLowerCase().trim();
  return DOCUMENT_TYPE_MAP[normalized] ?? '';
}

/**
 * Parse kamerstuk reference (e.g., "35073-3" or "35 073, nr. 3").
 */
function parseKamerstukRef(
  dossiernummer: string,
  ondernummer: string,
  year?: string,
): string {
  if (!dossiernummer) return '';

  // Clean up dossiernummer (remove spaces, leading zeros)
  const cleanDossier = dossiernummer.replace(/\s+/g, '').replace(/^0+/, '');
  const cleanOnder = ondernummer.replace(/\s+/g, '').replace(/^0+/, '');

  // Format: Kamerstukken II YYYY/YY, DOSSIER, nr. NUMMER
  // If we don't have year info, use a simpler format
  if (year) {
    const yearNum = parseInt(year, 10);
    const nextYear = (yearNum + 1) % 100;
    return `Kamerstukken II ${year}/${String(nextYear).padStart(2, '0')}, ${cleanDossier}, nr. ${cleanOnder}`;
  }

  return `Kamerstukken II ${cleanDossier}, nr. ${cleanOnder}`;
}

/**
 * Fetch a single page from the SRU service and return kamerstuk records.
 */
async function fetchSRUPage(startRecord: number): Promise<{
  records: KamerstukRecord[];
  totalRecords: number;
  nextRecordPosition: number | null;
}> {
  const url = new URL(SRU_BASE);
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('version', '1.2');
  url.searchParams.set('x-connection', 'ob'); // officielebekendmakingen
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
  const records: KamerstukRecord[] = [];

  for (const rawRecord of rawRecords) {
    if (rawRecord == null || typeof rawRecord !== 'object') continue;
    const rec = rawRecord as Record<string, unknown>;

    const recordData = rec['recordData'] as Record<string, unknown> | undefined;
    if (!recordData) continue;

    const gzd = recordData['gzd'] as Record<string, unknown> | undefined;
    if (!gzd) continue;

    const originalData = gzd['originalData'] as Record<string, unknown> | undefined;
    if (!originalData) continue;

    const owmsKern = originalData['owmskern'] ?? originalData['owms-kern'] as Record<string, unknown> | undefined;
    if (!owmsKern || typeof owmsKern !== 'object') continue;

    // Extract identifier
    const identifierNode = (owmsKern as Record<string, unknown>)['identifier'];
    const identifier = extractText(identifierNode);

    // Skip if no identifier
    if (!identifier) continue;

    // Extract title
    const titleNode = (owmsKern as Record<string, unknown>)['title'];
    const title = extractText(titleNode);

    // Extract date
    const dateNode = (owmsKern as Record<string, unknown>)['issued'] ?? (owmsKern as Record<string, unknown>)['modified'];
    const date = extractText(dateNode).substring(0, 10);

    // Extract description/summary
    const descNode = (owmsKern as Record<string, unknown>)['description'] ?? (owmsKern as Record<string, unknown>)['abstract'];
    const summary = extractText(descNode);

    // Extract dossiernummer and ondernummer from enrichedData or identifier
    const enrichedData = gzd['enrichedData'] as Record<string, unknown> | undefined;
    let dossiernummer = '';
    let ondernummer = '';
    let documentType = '';
    let year = '';

    if (enrichedData) {
      dossiernummer = extractText(enrichedData['dossiernummer'] ?? enrichedData['dossier']);
      ondernummer = extractText(enrichedData['ondernummer'] ?? enrichedData['nummer']);
      documentType = normalizeDocumentType(extractText(enrichedData['type'] ?? enrichedData['documentType']));
      year = extractText(enrichedData['year'] ?? enrichedData['vergaderjaar']);
    }

    // Try to extract from identifier if not found
    if (!dossiernummer || !ondernummer) {
      // Pattern: kst-12345-6 or similar
      const match = identifier.match(/(\d+)-(\d+)/);
      if (match) {
        dossiernummer = dossiernummer || match[1];
        ondernummer = ondernummer || match[2];
      }
    }

    // Build kamerstuk reference
    const kamerstukRef = parseKamerstukRef(dossiernummer, ondernummer, year);

    // Look for BWB references in summary, description, and related metadata
    const allText = `${summary} ${title} ${extractText((owmsKern as Record<string, unknown>)['subject'])}`;
    const relatedBwbIds = extractBwbIds(allText);

    // Build URL
    const url = identifier.startsWith('http')
      ? identifier
      : `https://zoek.officielebekendmakingen.nl/${identifier.replace(/^.*\//, '')}`;

    // Only add if we have minimum required data
    if (dossiernummer && ondernummer && title) {
      records.push({
        id: identifier,
        title,
        dossiernummer,
        ondernummer,
        kamerstukRef,
        documentType,
        date,
        summary,
        relatedBwbIds,
        url,
      });
    }
  }

  return { records, totalRecords, nextRecordPosition };
}

/**
 * Write a batch of kamerstukken to a seed file.
 */
function writeKamerstukSeed(records: KamerstukRecord[], batchIndex: number): void {
  const documents = records.map((r) => ({
    id: r.id,
    type: 'kamerstuk' as const,
    title: r.title,
    status: 'in_force' as const,
    issued_date: r.date || undefined,
    url: r.url,
    description: r.summary.substring(0, 500) || undefined,
  }));

  // Create preparatory works entries only for kamerstukken with BWB links
  const preparatoryWorks = [];
  for (const record of records) {
    for (const bwbId of record.relatedBwbIds) {
      preparatoryWorks.push({
        statute_id: bwbId,
        prep_document_id: record.id,
        kamerstuk_ref: record.kamerstukRef || undefined,
        document_type: record.documentType || undefined,
        title: record.title,
        summary: record.summary.substring(0, 500) || undefined,
      });
    }
  }

  const seedData = {
    documents,
    ...(preparatoryWorks.length > 0 ? { preparatory_works: preparatoryWorks } : {}),
  };

  const fileName = `kamerstuk-batch-${String(batchIndex).padStart(4, '0')}.json`;
  const filePath = path.join(SEED_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
  console.log(`  Wrote ${fileName} (${records.length} kamerstukken, ${preparatoryWorks.length} links to BWB)`);
}

/**
 * Check if a batch file already exists.
 */
function batchFileExists(batchIndex: number): boolean {
  const fileName = `kamerstuk-batch-${String(batchIndex).padStart(4, '0')}.json`;
  const filePath = path.join(SEED_DIR, fileName);
  return fs.existsSync(filePath);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Preparatory Works (Kamerstukken) Ingestion ===');
  console.log();

  // Ensure seed directory exists
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  console.log('Phase 1: Discovering kamerstukken via SRU...');

  let startRecord = 1;
  let batchIndex = 0;
  let totalRecords = 0;
  let totalKamerstukken = 0;
  let totalLinks = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Check if batch already exists
    if (batchFileExists(batchIndex)) {
      console.log(`  Batch ${batchIndex} already exists, skipping...`);
      batchIndex++;
      startRecord += SRU_PAGE_SIZE;

      // Stop if we've checked enough batches
      if (batchIndex >= MAX_BATCHES) {
        console.log(`  Reached maximum batch limit (${MAX_BATCHES}), stopping.`);
        break;
      }
      continue;
    }

    const page = await fetchSRUPage(startRecord);
    totalRecords = page.totalRecords;

    console.log(`  Found ${page.records.length} kamerstukken in this page (${startRecord} / ${totalRecords})`);

    if (page.records.length === 0) {
      console.log('  No more records found.');
      break;
    }

    // Write batch
    writeKamerstukSeed(page.records, batchIndex);
    totalKamerstukken += page.records.length;

    // Count BWB links
    for (const record of page.records) {
      totalLinks += record.relatedBwbIds.length;
    }

    batchIndex++;

    // Check if we should continue
    if (page.nextRecordPosition == null || batchIndex >= MAX_BATCHES) {
      if (batchIndex >= MAX_BATCHES) {
        console.log(`  Reached maximum batch limit (${MAX_BATCHES}), stopping.`);
      }
      break;
    }

    startRecord = page.nextRecordPosition;
    await sleep(RATE_LIMIT_MS);
  }

  console.log();
  console.log('=== Preparatory Works Ingestion Complete ===');
  console.log(`  Total kamerstukken:  ${totalKamerstukken}`);
  console.log(`  Links to statutes:   ${totalLinks}`);
  console.log(`  Batch files:         ${batchIndex}`);
  console.log();
  console.log('Note: Only kamerstukken with BWB references are linked to statutes.');
  console.log('Run "npm run build:db" to rebuild the database with the new data.');
}

main().catch((err) => {
  console.error('Fatal error during kamerstuk ingestion:', err);
  process.exit(1);
});
