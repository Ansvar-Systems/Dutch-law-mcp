#!/usr/bin/env tsx
/**
 * BWB (Basiswettenbestand) ingestion script.
 *
 * Discovers statutes via the SRU search service at zoekservice.overheid.nl,
 * selects the NEWEST in-force toestand (consolidation) per statute, fetches
 * its XML, parses it with the BWB XML parser, and writes seed JSON files to
 * data/seed/.
 *
 * Toestand selection matters: SRU returns one record per toestand of a
 * statute, ordered OLDEST-FIRST, and the repository's un-versioned XML URL
 * 301-redirects to the oldest toestand. The pre-2026-06-10 "first occurrence"
 * dedup therefore pinned the corpus to the oldest consolidation (the deployed
 * Criminal Code was its 2002-04-01 state). See src/ingest/toestand.ts.
 *
 * Usage: npm run ingest            (additive: only statutes without a seed)
 *        npm run ingest:refresh    (also refetch statutes whose newest
 *                                   toestand differs from the seed's stamp,
 *                                   or whose freshness cannot be proven)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';
import { decideFetch, type SeedIngestMeta } from '../src/ingest/refresh-policy.js';
import { fetchPageWithRetry, assertDiscoveryComplete } from '../src/ingest/sru-pagination.js';
import { parseSruResponse, type SruDocRecord } from '../src/ingest/sru-response.js';
import {
  selectCurrentToestandRecord,
  parseToestandFromUrl,
  toestandKey,
} from '../src/ingest/toestand.js';
import { resolveNewestToestand } from '../src/ingest/sru-resolve.js';
import { buildSeed } from '../src/ingest/seed-writer.js';
import { fetchWithRetry } from '../src/ingest/http-retry.js';
import { parseIdList } from '../src/ingest/id-list.js';

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

const RATE_LIMIT_MS = 2000;

// --refresh: refetch statutes whose newest upstream toestand differs from the
// seed's _ingest stamp (or whose freshness cannot be proven). Default stays
// additive-only.
const REFRESH = process.argv.includes('--refresh');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single page from the SRU service and return parsed records.
 */
async function fetchSRUPage(startRecord: number) {
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

  return parseSruResponse(await response.text());
}

/**
 * Fetch the toestand XML for a BWB-ID and parse it into provisions.
 * The toestand URL is REQUIRED here: the un-versioned repository URL
 * 301-redirects to the oldest toestand and must never be used as a fallback.
 */
async function fetchAndParseBWB(
  bwbId: string,
  toestandUrl: string,
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
  try {
    // Retried fetch: a single transient 5xx among ~24k document fetches must
    // not fail the statute (and thereby the whole sweep's exit code).
    const response = await fetchWithRetry(toestandUrl);
    if (!response.ok) {
      console.warn(`  WARNING: Failed to fetch XML for ${bwbId}: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const parsed = parseBwbXml(xml);
    if (parsed.bwb_id && parsed.bwb_id !== bwbId) {
      // Redirect surprises happen on this upstream; a body for a different
      // document must never be written under this statute's identity.
      console.warn(`  WARNING: ${toestandUrl} served ${parsed.bwb_id}, expected ${bwbId}`);
      return null;
    }

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
  options: {
    in_force_date?: string;
    sruModified?: string | null;
    toestand?: string | null;
    status?: 'in_force' | 'repealed';
  } = {},
): void {
  const seedData = buildSeed({
    bwbId,
    title,
    provisions,
    in_force_date: options.in_force_date,
    status: options.status,
    sruModified: options.sruModified ?? null,
    toestand: options.toestand ?? null,
    now: new Date().toISOString(),
  });

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
  const allRecords: SruDocRecord[] = [];
  let startRecord = 1;
  let declaredTotal: number | null = null;

  let rawFound = 0;
  let droppedTotal = 0;
  const droppedPages: number[] = [];
  while (true) {
    // Retry transient broken pages with backoff; a persistently broken page
    // fails LOUD — never treated as end-of-pagination (2026-06-10 truncation).
    // Extraction drops are NOT page health: a record shape the parser cannot
    // extract is deterministic (live example: BWBW-prefixed ids before they
    // were accepted), so retrying cannot fix it — those are accumulated and
    // fail the run AFTER discovery, with counts, where the operator can see
    // every affected page at once.
    const p = await fetchPageWithRetry(fetchSRUPage, startRecord, {
      isHealthy: (page) => page.rawCount > 0,
    });
    // A glitched final page can omit numberOfRecords; keep the largest usable
    // declaration instead of letting the last page overwrite it.
    if (p.totalRecords != null && (declaredTotal == null || p.totalRecords > declaredTotal)) {
      declaredTotal = p.totalRecords;
    }
    rawFound += p.rawCount;
    if (p.droppedCount > 0) {
      droppedTotal += p.droppedCount;
      droppedPages.push(startRecord);
    }
    allRecords.push(...p.records);

    console.log(`  Found ${rawFound} / ${declaredTotal ?? '?'} records`);

    if (p.nextRecordPosition == null) {
      break;
    }
    if (p.nextRecordPosition <= startRecord) {
      throw new Error(
        `SRU nextRecordPosition ${p.nextRecordPosition} does not advance past ${startRecord} — refusing a non-progressing pagination`,
      );
    }

    startRecord = p.nextRecordPosition;
    await sleep(RATE_LIMIT_MS);
  }

  // Records whose id could not be extracted are missing coverage, not noise.
  if (droppedTotal > 0) {
    throw new Error(
      `SRU discovery dropped ${droppedTotal} record(s) whose BWB id could not be extracted ` +
        `(pages starting at: ${droppedPages.join(', ')}). The parser must learn their shape ` +
        'before a sweep can be trusted — refusing a silently narrowed worklist.',
    );
  }

  // A discovery that ends short of the declared total (or with no usable
  // declared total at all) is an error, not a result.
  assertDiscoveryComplete(rawFound, declaredTotal);

  console.log(`Discovered ${allRecords.length} toestand records.`);

  // Group records per BWB-ID and select the NEWEST in-force toestand for each
  // (SRU returns the full toestand history per statute, oldest first).
  const byBwbId = new Map<string, SruDocRecord[]>();
  for (const record of allRecords) {
    const group = byBwbId.get(record.bwbId);
    if (group) {
      group.push(record);
    } else {
      byBwbId.set(record.bwbId, [record]);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const uniqueRecords: SruDocRecord[] = [];
  for (const group of byBwbId.values()) {
    const chosen = selectCurrentToestandRecord(group, today);
    if (chosen) uniqueRecords.push(chosen);
  }
  console.log(`Unique statutes: ${uniqueRecords.length}`);
  console.log();

  // 2. Fetch and parse each statute
  console.log('Phase 2: Fetching and parsing statute XML...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < uniqueRecords.length; i++) {
    const record = uniqueRecords[i];
    const seedPath = path.join(SEED_DIR, `${record.bwbId}.json`);

    const seedExists = fs.existsSync(seedPath);
    let existingMeta: SeedIngestMeta | null = null;
    if (seedExists && REFRESH) {
      try {
        const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as {
          _ingest?: SeedIngestMeta;
        };
        existingMeta = parsed._ingest ?? null;
      } catch {
        existingMeta = null; // unreadable seed -> freshness unprovable -> refetch
      }
    }
    const recordVersion = parseToestandFromUrl(record.toestandUrl);
    const decision = decideFetch({
      seedExists,
      refresh: REFRESH,
      existingMeta,
      sruModified: record.modified,
      upstreamToestand: recordVersion ? toestandKey(recordVersion) : null,
    });

    if (decision === 'skip_existing' || decision === 'skip_current') {
      console.log(
        `  [${i + 1}/${uniqueRecords.length}] ${record.bwbId} — ${decision === 'skip_current' ? 'current (upstream unchanged), skipping' : 'already exists, skipping'}`,
      );
      successCount++;
      continue;
    }

    console.log(`  [${i + 1}/${uniqueRecords.length}] ${record.bwbId} — ${decision}, fetching...`);

    // The discovery record usually carries the toestand URL. When it does
    // not, resolve it per id — NEVER fall back to the un-versioned URL, which
    // redirects to the oldest toestand.
    let toestandUrl = record.toestandUrl ?? null;
    let toestand = recordVersion ? toestandKey(recordVersion) : null;
    if (!toestandUrl) {
      try {
        const resolved = await resolveNewestToestand(record.bwbId, { today });
        toestandUrl = resolved?.toestandUrl ?? null;
        toestand = resolved?.toestand ?? null;
      } catch (err) {
        console.warn(`    WARNING: toestand resolution failed: ${String(err)}`);
      }
      if (!toestandUrl) {
        console.warn(
          `    ERROR: no toestand URL for ${record.bwbId} — refusing the un-versioned URL (serves the oldest consolidation)`,
        );
        errorCount++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }
    }

    const result = await fetchAndParseBWB(record.bwbId, toestandUrl);

    if (result && result.provisions.length > 0) {
      writeSeedFile(record.bwbId, result.title || record.title, result.provisions, {
        in_force_date: result.in_force_date,
        sruModified: record.modified ?? null,
        toestand,
        // A past validity end on the newest toestand = expired instrument.
        status: record.validityEnd != null && record.validityEnd < today ? 'repealed' : 'in_force',
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

  // Phase 3 (refresh only): seeds on disk that neither this discovery nor the
  // committed backfill list can ever refresh-check would go silently stale
  // forever. Enumerate them — a warning today, the input for widening
  // discovery (issue #119 follow-up).
  if (REFRESH) {
    const reachable = new Set<string>(uniqueRecords.map((r) => r.bwbId));
    const backfillList = path.resolve(__dirname, '..', 'data', 'backfill-ids.txt');
    if (fs.existsSync(backfillList)) {
      try {
        for (const id of parseIdList(fs.readFileSync(backfillList, 'utf-8'))) reachable.add(id);
      } catch (err) {
        console.warn(`  WARNING: could not read backfill list: ${String(err)}`);
      }
    }
    const unreachable = fs
      .readdirSync(SEED_DIR)
      .filter((f) => f.startsWith('BWB') && f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter((id) => !reachable.has(id));
    if (unreachable.length > 0) {
      console.warn(
        `  WARNING: ${unreachable.length} seed(s) on disk are reachable by NEITHER discovery nor ` +
          `the backfill list and can never be refresh-checked: ${unreachable.slice(0, 10).join(', ')}` +
          (unreachable.length > 10 ? ', …' : '') +
          ' — add them to data/backfill-ids.txt or widen discovery.',
      );
    }
  }

  console.log();
  console.log('=== BWB Ingestion Complete ===');
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors:  ${errorCount}`);

  if (errorCount > 0) {
    // Machine-readable failure: the fix-sweep rebuild contract (sources.yml)
    // runs this script and reads the exit code. A run with failed statutes is
    // a partial run — it must never look like a clean rebuild input.
    console.error(`${errorCount} statute(s) failed to fetch/parse — exiting non-zero.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error during BWB ingestion:', err);
  process.exit(1);
});
