#!/usr/bin/env tsx
/**
 * Premium-tier rechtspraak.nl case law ingestion.
 *
 * Fetches court decisions directly into the database (not seed files).
 * Two-step retrieval: search for ECLIs → fetch full XML per decision.
 * Populates: legal_documents, case_law, case_law_full
 *
 * Source:   data.rechtspraak.nl (public domain, Art. 11 Auteurswet)
 * Rate:     max 10 req/s
 *
 * Usage:
 *   npm run ingest:cases:premium                              # all courts
 *   npm run ingest:cases:premium -- --court HR                # Hoge Raad only
 *   npm run ingest:cases:premium -- --court HR,RVS,CRVB      # multiple courts
 *   npm run ingest:cases:premium -- --year 2024               # specific year
 *   npm run ingest:cases:premium -- --limit 500 --resume      # incremental
 *   npm run ingest:cases:premium -- --dry-run                 # preview
 */

import Database from '@ansvar/mcp-sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'database.db');

// ─────────────────────────────────────────────────────────────────────────────
// API endpoints
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_URL = 'https://data.rechtspraak.nl/uitspraken/zoeken';
const CONTENT_URL = 'https://data.rechtspraak.nl/uitspraken/content';
const BATCH_SIZE = 1000;
const RATE_LIMIT_MS = 120; // ~8 req/s (safe margin under 10/s)

// ─────────────────────────────────────────────────────────────────────────────
// Courts — ordered by importance
// ─────────────────────────────────────────────────────────────────────────────

const COURTS: Record<string, { name: string; creator: string }> = {
  HR: {
    name: 'Hoge Raad',
    creator: 'http://standaarden.overheid.nl/owms/terms/Hoge_Raad_der_Nederlanden',
  },
  RVS: {
    name: 'Raad van State',
    creator: 'http://standaarden.overheid.nl/owms/terms/Raad_van_State',
  },
  PHR: {
    name: 'Parket bij de Hoge Raad',
    creator: 'http://standaarden.overheid.nl/owms/terms/Parket_bij_de_Hoge_Raad',
  },
  CRVB: {
    name: 'Centrale Raad van Beroep',
    creator: 'http://standaarden.overheid.nl/owms/terms/Centrale_Raad_van_Beroep',
  },
  CBB: {
    name: 'College van Beroep voor het bedrijfsleven',
    creator: 'http://standaarden.overheid.nl/owms/terms/College_van_Beroep_voor_het_bedrijfsleven',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// XML parser
// ─────────────────────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) =>
    ['entry', 'link', 'subject', 'para', 'parablock', 'paragroup', 'section'].includes(name),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractAllText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).filter(Boolean).join('\n');
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']);
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue;
      parts.push(extractAllText(val));
    }
    return parts.filter(Boolean).join('\n');
  }
  return '';
}

function inferLegalDomain(subject: string, procedureType: string): string {
  const text = `${subject} ${procedureType}`.toLowerCase();
  if (text.includes('straf') || text.includes('penal')) return 'Strafrecht';
  if (text.includes('bestuur') || text.includes('bestuurs')) return 'Bestuursrecht';
  if (text.includes('belasting') || text.includes('fiscal')) return 'Belastingrecht';
  if (text.includes('civiel') || text.includes('verbintenis') || text.includes('handels'))
    return 'Civiel recht';
  if (text.includes('familie') || text.includes('personen')) return 'Personen- en familierecht';
  if (text.includes('arbeids') || text.includes('sociaal')) return 'Arbeidsrecht';
  return '';
}

function courtCodeFromEcli(ecli: string): string {
  const parts = ecli.split(':');
  return parts.length >= 4 ? parts[2] : 'UNKNOWN';
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const wait = attempt * 3000;
        console.log(`  HTTP ${res.status} — retry ${attempt}/${maxRetries} in ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(attempt * 2000);
    }
  }
  throw new Error('Unreachable');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

const limitIdx = args.indexOf('--limit');
const MAX_DECISIONS = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const courtIdx = args.indexOf('--court');
const TARGET_COURTS = courtIdx >= 0 ? args[courtIdx + 1].split(',') : Object.keys(COURTS);

const yearIdx = args.indexOf('--year');
const TARGET_YEAR = yearIdx >= 0 ? args[yearIdx + 1] : null;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Search for ECLIs
// ─────────────────────────────────────────────────────────────────────────────

interface EcliSearchResult {
  ecli: string;
  court: string;
  decisionDate: string;
  title: string;
  summary: string;
  keywords: string;
  procedureType: string;
  legalDomain: string;
}

async function searchEclis(
  courtFilter?: string,
  year?: string | null,
  offset = 0,
): Promise<{
  results: EcliSearchResult[];
  hasMore: boolean;
}> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('max', String(BATCH_SIZE));
  url.searchParams.set('from', String(offset));
  url.searchParams.set('return', 'DOC');
  url.searchParams.set('sort', 'DESC');
  url.searchParams.set('type', 'Uitspraak');

  if (courtFilter) {
    url.searchParams.set('creator', courtFilter);
  }
  if (year) {
    url.searchParams.append('date', `${year}-01-01`);
    url.searchParams.append('date', `${year}-12-31`);
  }

  const res = await fetchWithRetry(url.toString());
  const xml = await res.text();
  const doc = xmlParser.parse(xml) as Record<string, unknown>;

  const feed = doc['feed'] as Record<string, unknown> | undefined;
  if (!feed) return { results: [], hasMore: false };

  const entries = toArray(feed['entry']);
  const results: EcliSearchResult[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const id = typeof e['id'] === 'string' ? e['id'].trim() : '';
    if (!id.startsWith('ECLI:')) continue;

    const title = extractAllText(e['title']).trim();
    const updated = e['updated'] ?? e['published'];
    const decisionDate = typeof updated === 'string' ? updated.substring(0, 10) : '';

    const inhoud = e['inhoudsindicatie'];
    const summaryNode = e['summary'] ?? e['content'];
    const summary = (inhoud ? extractAllText(inhoud) : extractAllText(summaryNode)).trim();

    const subjects = toArray(e['subject']);
    const keywords = subjects
      .map((s) => extractAllText(s).trim())
      .filter(Boolean)
      .join('; ');

    const procedureType = extractAllText(e['procedure'] ?? e['type']).trim();
    const creatorText = extractAllText(e['creator'] ?? e['publisher']).trim();
    const court =
      Object.entries(COURTS).find(([, v]) => creatorText.includes(v.name))?.[0] ??
      courtCodeFromEcli(id);
    const legalDomain = inferLegalDomain(keywords, procedureType);

    results.push({
      ecli: id,
      court,
      decisionDate,
      title: title || `${court} ${decisionDate}`,
      summary,
      keywords,
      procedureType,
      legalDomain,
    });
  }

  const links = toArray(feed['link']);
  const hasMore =
    links.some(
      (l) => l && typeof l === 'object' && (l as Record<string, unknown>)['@_rel'] === 'next',
    ) || entries.length >= BATCH_SIZE;

  return { results, hasMore };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Fetch full text for a single ECLI
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFullText(
  ecli: string,
): Promise<{ fullText: string; headnotes: string; dissenting: string } | null> {
  try {
    const url = `${CONTENT_URL}?id=${encodeURIComponent(ecli)}`;
    const res = await fetchWithRetry(url);
    const xml = await res.text();
    const doc = xmlParser.parse(xml) as Record<string, unknown>;

    // Navigate open-rechtspraak XML structure
    const root = (doc['open-rechtspraak'] ?? doc) as Record<string, unknown>;
    const rdfDesc = (root?.['RDF'] as Record<string, unknown>)?.['Description'];
    const uitspraak = (root?.['uitspraak'] ?? root?.['conclusie']) as
      | Record<string, unknown>
      | undefined;

    if (!uitspraak) return null;

    // Extract sections
    const sections: string[] = [];
    const headnoteParts: string[] = [];
    const dissentParts: string[] = [];

    // Uitspraak body
    const body = uitspraak?.['section'] ?? uitspraak?.['paragroup'] ?? uitspraak?.['para'];
    if (body) sections.push(extractAllText(body));

    // Check for specific named sections
    for (const sec of toArray(uitspraak?.['section'])) {
      if (!sec || typeof sec !== 'object') continue;
      const s = sec as Record<string, unknown>;
      const roleVal = s['@_role'];
      const role = (typeof roleVal === 'string' ? roleVal : '').toLowerCase();
      const text = extractAllText(s);

      if (role.includes('conclusie') || role.includes('headnote')) {
        headnoteParts.push(text);
      } else if (role.includes('dissent') || role.includes('minderheid')) {
        dissentParts.push(text);
      } else {
        sections.push(text);
      }
    }

    // Also check for inhoudsindicatie in RDF
    if (rdfDesc) {
      const inhoud = extractAllText((rdfDesc as Record<string, unknown>)['inhoudsindicatie']);
      if (inhoud) headnoteParts.unshift(inhoud);
    }

    const fullText = sections.join('\n\n').trim();
    if (!fullText) return null;

    return {
      fullText,
      headnotes: headnoteParts.join('\n\n').trim(),
      dissenting: dissentParts.join('\n\n').trim(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ Rechtspraak.nl Premium Ingestion ═══');
  console.log(`  Courts:   ${TARGET_COURTS.join(', ')}`);
  console.log(`  Year:     ${TARGET_YEAR ?? 'all'}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:   ${RESUME}`);
  console.log(`  Limit:    ${MAX_DECISIONS === Infinity ? 'none' : MAX_DECISIONS}`);
  console.log();

  if (DRY_RUN) {
    console.log('  DRY RUN — checking available counts...');
    for (const courtCode of TARGET_COURTS) {
      const courtInfo = COURTS[courtCode];
      if (!courtInfo) {
        console.log(`  Unknown court: ${courtCode}`);
        continue;
      }
      const { results } = await searchEclis(courtInfo.creator, TARGET_YEAR, 0);
      console.log(`  ${courtCode} (${courtInfo.name}): ${results.length}+ decisions`);
      await sleep(RATE_LIMIT_MS);
    }
    return;
  }

  // Open database
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: No database at ${DB_PATH}. Run 'npm run build:db' first.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const hasCaseLawFull = !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='case_law_full'")
    .get();

  if (hasCaseLawFull) console.log('  Paid tier detected: will populate case_law_full');

  // Existing ECLIs for --resume
  const existingEclis = new Set<string>();
  if (RESUME) {
    const rows = db.prepare('SELECT ecli FROM case_law WHERE ecli IS NOT NULL').all() as {
      ecli: string;
    }[];
    for (const r of rows) existingEclis.add(r.ecli);
    console.log(`  Resume: ${existingEclis.size} existing ECLIs will be skipped`);
  }

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO legal_documents (id, title, type, status, issued_date, url)
    VALUES (?, ?, 'case_law', 'in_force', ?, ?)
  `);

  const insertCaseLaw = db.prepare(`
    INSERT OR IGNORE INTO case_law (document_id, court, ecli, decision_date, procedure_type, legal_domain, summary, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCaseLawFull = hasCaseLawFull
    ? db.prepare(`
        INSERT OR IGNORE INTO case_law_full (case_law_id, full_text, headnotes, dissenting_opinions)
        VALUES (?, ?, ?, ?)
      `)
    : null;

  // Stats
  let totalInserted = 0;
  let totalFullText = 0;
  let totalSkipped = 0;
  const totalFailed = 0;

  for (const courtCode of TARGET_COURTS) {
    if (totalInserted >= MAX_DECISIONS) break;

    const courtInfo = COURTS[courtCode];
    if (!courtInfo) {
      console.log(`  Unknown court: ${courtCode}, skipping`);
      continue;
    }

    console.log(`\n── ${courtCode} · ${courtInfo.name} ──`);

    let offset = 0;
    let courtInserted = 0;

    while (totalInserted < MAX_DECISIONS) {
      // Step 1: Search batch
      const { results, hasMore } = await searchEclis(courtInfo.creator, TARGET_YEAR, offset);
      if (results.length === 0) break;

      // Step 2: Process each decision
      for (const decision of results) {
        if (totalInserted >= MAX_DECISIONS) break;

        if (RESUME && existingEclis.has(decision.ecli)) {
          totalSkipped++;
          continue;
        }

        // Insert metadata
        const insertOne = db.transaction(() => {
          const ecliUrl = `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(decision.ecli)}`;
          insertDoc.run(decision.ecli, decision.title, decision.decisionDate, ecliUrl);
          insertCaseLaw.run(
            decision.ecli,
            decision.court,
            decision.ecli,
            decision.decisionDate,
            decision.procedureType,
            decision.legalDomain,
            decision.summary,
            decision.keywords,
          );
        });

        try {
          insertOne();
          totalInserted++;
          courtInserted++;
        } catch {
          totalSkipped++;
          continue;
        }

        // Step 2b: Fetch full text (paid tier)
        if (insertCaseLawFull) {
          const fullData = await fetchFullText(decision.ecli);
          if (fullData) {
            const caseLawRow = db
              .prepare('SELECT id FROM case_law WHERE ecli = ?')
              .get(decision.ecli) as { id: number } | undefined;
            if (caseLawRow) {
              try {
                insertCaseLawFull.run(
                  caseLawRow.id,
                  fullData.fullText,
                  fullData.headnotes || null,
                  fullData.dissenting || null,
                );
                totalFullText++;
              } catch {
                // Duplicate or constraint error
              }
            }
          }
          await sleep(RATE_LIMIT_MS);
        }
      }

      offset += results.length;

      console.log(
        `  [${courtCode}] offset=${offset} inserted=${courtInserted} fullText=${totalFullText} skipped=${totalSkipped}`,
      );

      if (!hasMore) break;
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Finalize
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  console.log(`\n═══ Rechtspraak Premium Ingestion Complete ═══`);
  console.log(`  Inserted:   ${totalInserted}`);
  console.log(`  Full text:  ${totalFullText}`);
  console.log(`  Skipped:    ${totalSkipped}`);
  console.log(`  Failed:     ${totalFailed}`);
  console.log(`  Database:   ${DB_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
