#!/usr/bin/env tsx
/**
 * Rechtspraak.nl case law ingestion script.
 *
 * Fetches court decisions from the open data API at data.rechtspraak.nl,
 * parses the Atom/XML response, and writes seed JSON files to data/seed/.
 *
 * Usage: npm run ingest:cases
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

const API_BASE = 'https://data.rechtspraak.nl/uitspraken/zoeken';
const MAX_RESULTS = 1000;
const RATE_LIMIT_MS = 100;

// Map rechtspraak.nl court abbreviations to short codes
const COURT_CODE_MAP: Record<string, string> = {
  'Hoge Raad': 'HR',
  'Raad van State': 'RVS',
  'Centrale Raad van Beroep': 'CRVB',
  'College van Beroep voor het bedrijfsleven': 'CBB',
  'Parket bij de Hoge Raad': 'PHR',
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
    const parts: string[] = [];
    for (const key of Object.keys(obj)) {
      if (key.startsWith('@_')) continue;
      parts.push(extractText(obj[key]));
    }
    return parts.filter(Boolean).join(' ');
  }
  return '';
}

/**
 * Derive a court code from the ECLI string.
 * ECLI format: ECLI:NL:<COURT>:<YEAR>:<NUMBER>
 */
function courtFromEcli(ecli: string): string {
  const parts = ecli.split(':');
  if (parts.length >= 4) {
    return parts[2]; // e.g., "HR", "RVS", "RBAMS"
  }
  return 'UNKNOWN';
}

/**
 * Infer the legal domain from subject/procedure metadata.
 */
function inferLegalDomain(subject: string, procedureType: string): string {
  const text = `${subject} ${procedureType}`.toLowerCase();
  if (text.includes('straf') || text.includes('penal')) return 'Strafrecht';
  if (text.includes('bestuur') || text.includes('bestuurs')) return 'Bestuursrecht';
  if (text.includes('belasting') || text.includes('fiscal')) return 'Belastingrecht';
  if (text.includes('civiel') || text.includes('verbintenis') || text.includes('handels')) return 'Civiel recht';
  if (text.includes('familie') || text.includes('personen')) return 'Personen- en familierecht';
  if (text.includes('arbeids') || text.includes('sociaal')) return 'Arbeidsrecht';
  return '';
}

interface ParsedDecision {
  ecli: string;
  title: string;
  court: string;
  decisionDate: string;
  summary: string;
  keywords: string;
  procedureType: string;
  legalDomain: string;
}

/**
 * Fetch and parse a batch of decisions from the rechtspraak.nl API.
 */
async function fetchDecisions(offset: number): Promise<{
  decisions: ParsedDecision[];
  hasMore: boolean;
}> {
  const url = new URL(API_BASE);
  url.searchParams.set('max', String(MAX_RESULTS));
  url.searchParams.set('from', String(offset));
  url.searchParams.set('return', 'DOC');
  url.searchParams.set('sort', 'DESC');

  console.log(`  Fetching decisions from offset ${offset}...`);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Rechtspraak API error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });

  const doc = parser.parse(xml) as Record<string, unknown>;

  // Navigate Atom feed structure
  const feed = doc['feed'] as Record<string, unknown> | undefined;
  if (!feed) {
    return { decisions: [], hasMore: false };
  }

  const entries = toArray(feed['entry']);
  const decisions: ParsedDecision[] = [];

  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object') continue;
    const entryObj = entry as Record<string, unknown>;

    // Extract ECLI from id
    const id = entryObj['id'];
    const ecli = typeof id === 'string' ? id.trim() : '';
    if (!ecli || !ecli.startsWith('ECLI:')) continue;

    // Extract title
    const title = extractText(entryObj['title']).trim();

    // Extract date
    const updated = entryObj['updated'] ?? entryObj['published'];
    const decisionDate = typeof updated === 'string' ? updated.substring(0, 10) : '';

    // Extract summary from content or summary element
    const summaryNode = entryObj['summary'] ?? entryObj['content'];
    const summary = extractText(summaryNode).trim();

    // Extract metadata from inhoudsindicatie or subject elements
    const inhoud = entryObj['inhoudsindicatie'];
    const inhoudText = inhoud ? extractText(inhoud).trim() : '';
    const fullSummary = inhoudText || summary;

    // Extract subject/keywords
    const subjects = toArray(entryObj['subject']);
    const keywordsList: string[] = [];
    for (const subj of subjects) {
      const text = extractText(subj).trim();
      if (text) keywordsList.push(text);
    }

    // Extract procedure type
    const procedureNode = entryObj['procedure'] ?? entryObj['type'];
    const procedureType = extractText(procedureNode).trim();

    // Extract court info
    const creatorNode = entryObj['creator'] ?? entryObj['publisher'];
    const creatorText = extractText(creatorNode).trim();
    const court = COURT_CODE_MAP[creatorText] ?? courtFromEcli(ecli);

    // Infer legal domain
    const legalDomain = inferLegalDomain(keywordsList.join(' '), procedureType);

    decisions.push({
      ecli,
      title: title || `${court} ${decisionDate}`,
      court,
      decisionDate,
      summary: fullSummary,
      keywords: keywordsList.join(' '),
      procedureType,
      legalDomain,
    });
  }

  // Check if there are more results
  const links = toArray(feed['link']);
  let hasMore = false;
  for (const link of links) {
    if (link == null || typeof link !== 'object') continue;
    const linkObj = link as Record<string, unknown>;
    if (linkObj['@_rel'] === 'next') {
      hasMore = true;
      break;
    }
  }

  // Also check: if we got a full page, there might be more
  if (entries.length >= MAX_RESULTS) {
    hasMore = true;
  }

  return { decisions, hasMore };
}

/**
 * Write a batch of case law decisions to a seed file.
 */
function writeCaseLawSeed(decisions: ParsedDecision[], batchIndex: number): void {
  const seedData = {
    documents: decisions.map((d) => ({
      id: d.ecli,
      type: 'case_law' as const,
      title: d.title,
      status: 'in_force' as const,
      issued_date: d.decisionDate,
      url: `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(d.ecli)}`,
      description: d.summary.substring(0, 500),
    })),
    case_law: decisions.map((d) => ({
      document_id: d.ecli,
      court: d.court,
      ecli: d.ecli,
      decision_date: d.decisionDate,
      procedure_type: d.procedureType,
      legal_domain: d.legalDomain,
      summary: d.summary,
      keywords: d.keywords,
    })),
  };

  const fileName = `rechtspraak-batch-${String(batchIndex).padStart(4, '0')}.json`;
  const filePath = path.join(SEED_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
  console.log(`  Wrote ${fileName} (${decisions.length} decisions)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Rechtspraak.nl Case Law Ingestion ===');
  console.log();

  // Ensure seed directory exists
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  let offset = 0;
  let batchIndex = 0;
  let totalDecisions = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { decisions, hasMore } = await fetchDecisions(offset);

    if (decisions.length === 0) {
      console.log('  No more decisions found.');
      break;
    }

    writeCaseLawSeed(decisions, batchIndex);
    totalDecisions += decisions.length;
    batchIndex++;
    offset += decisions.length;

    if (!hasMore) {
      break;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log();
  console.log('=== Rechtspraak Ingestion Complete ===');
  console.log(`  Total decisions: ${totalDecisions}`);
  console.log(`  Batch files:     ${batchIndex}`);
}

main().catch((err) => {
  console.error('Fatal error during rechtspraak ingestion:', err);
  process.exit(1);
});
