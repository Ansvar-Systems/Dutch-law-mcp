#!/usr/bin/env tsx
/**
 * Ingest Dutch preparatory works from Tweede Kamer Open Data API.
 *
 * Source:   gegevensmagazijn.tweedekamer.nl — OData v4 (JSON, no auth, CC0)
 * Content:  Wetgeving (legislative) cases with kamerstuk metadata
 *
 * Populates: legal_documents (type='kamerstuk'), preparatory_works, preparatory_works_full
 *
 * Links wetsvoorstellen → statutes via dossier number → BWB ID matching.
 *
 * Usage:
 *   npm run ingest:tweedekamer                     # all legislation cases
 *   npm run ingest:tweedekamer -- --limit 100      # test with 100
 *   npm run ingest:tweedekamer -- --resume         # skip existing
 *   npm run ingest:tweedekamer -- --dry-run        # preview only
 */

import Database from '@ansvar/mcp-sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'database.db');

// ─────────────────────────────────────────────────────────────────────────────
// OData API
// ─────────────────────────────────────────────────────────────────────────────

const TK_BASE = 'https://gegevensmagazijn.tweedekamer.nl/OData/v4/2.0';
const PAGE_SIZE = 250;
const RATE_LIMIT_MS = 300;

interface TKZaak {
  Id: string;
  Nummer: string; // dossier number
  Soort: string; // "Wetgeving"
  Titel: string;
  Citeertitel: string | null;
  Alias: string | null;
  Status: string;
  Onderwerp: string | null; // subject
  GestartOp: string | null; // start date
  HuidigeBehandelstatus: string | null;
  Afgedaan: boolean;
  GewijzigdOp: string;
  Verwijderd: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return res.json() as T;
      if (res.status === 429 || res.status >= 500) {
        const wait = attempt * 3000;
        console.log(`  HTTP ${res.status} — retry ${attempt}/${maxRetries} in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText} — ${url}`);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
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
const MAX_ROWS = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─────────────────────────────────────────────────────────────────────────────
// Statute matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to find a statute linked to a kamerstuk dossier number.
 * We search for BWB IDs that reference this dossier in their metadata.
 */
function findStatuteByDossier(db: InstanceType<typeof Database>, dossierNr: string): string | null {
  // Search in document descriptions/titles for the dossier number
  const match = db
    .prepare(
      "SELECT id FROM legal_documents WHERE type IN ('statute','amvb','ministerial_regulation') AND (description LIKE ? OR title LIKE ?) LIMIT 1",
    )
    .get(`%${dossierNr}%`, `%${dossierNr}%`) as { id: string } | undefined;

  return match?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ Tweede Kamer Preparatory Works Ingestion ═══');
  console.log(`  Source:   ${TK_BASE}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:   ${RESUME}`);
  console.log(`  Limit:    ${MAX_ROWS === Infinity ? 'none' : MAX_ROWS}`);
  console.log();

  // Get total count
  const countUrl = `${TK_BASE}/Zaak/$count?$filter=Soort eq 'Wetgeving' and Verwijderd eq false`;
  const totalCount = await fetchJson<number>(countUrl);
  console.log(`  Total wetgeving zaken: ${totalCount.toLocaleString()}`);

  if (DRY_RUN) {
    console.log(
      '\n  DRY RUN — would fetch and insert up to',
      Math.min(totalCount, MAX_ROWS),
      'zaken',
    );
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

  const hasPrepFull = !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='preparatory_works_full'")
    .get();

  if (hasPrepFull) console.log('  Paid tier detected: will populate preparatory_works_full');

  // Existing IDs for --resume
  const existingIds = new Set<string>();
  if (RESUME) {
    const rows = db.prepare("SELECT id FROM legal_documents WHERE id LIKE 'tk-zaak:%'").all() as {
      id: string;
    }[];
    for (const r of rows) existingIds.add(r.id);
    console.log(`  Resume: ${existingIds.size} existing entries will be skipped`);
  }

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO legal_documents (id, title, type, status, issued_date, url, description)
    VALUES (?, ?, 'kamerstuk', ?, ?, ?, ?)
  `);

  const insertPrepWork = db.prepare(`
    INSERT OR IGNORE INTO preparatory_works (statute_id, prep_document_id, kamerstuk_ref, document_type, title, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertPrepFull = hasPrepFull
    ? db.prepare(`
        INSERT OR IGNORE INTO preparatory_works_full (prep_work_id, full_text, section_summaries)
        VALUES (?, ?, NULL)
      `)
    : null;

  // Stats
  let inserted = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  // Paginate through OData API
  let skip = 0;

  while (processed < Math.min(totalCount, MAX_ROWS)) {
    const top = Math.min(PAGE_SIZE, MAX_ROWS - processed);
    const url = `${TK_BASE}/Zaak?$filter=Soort eq 'Wetgeving' and Verwijderd eq false&$orderby=GewijzigdOp desc&$top=${top}&$skip=${skip}`;

    let zaken: TKZaak[];
    try {
      const data = await fetchJson<{ value: TKZaak[] }>(url);
      zaken = data.value ?? [];
    } catch (err) {
      console.error(`  Error fetching skip=${skip}:`, err);
      failed += top;
      skip += top;
      processed += top;
      continue;
    }

    if (zaken.length === 0) break;

    const insertBatch = db.transaction(() => {
      for (const zaak of zaken) {
        processed++;
        if (processed > MAX_ROWS) break;

        const docId = `tk-zaak:${zaak.Id}`;
        if (RESUME && existingIds.has(docId)) {
          skipped++;
          continue;
        }

        const title = zaak.Titel || zaak.Citeertitel || `Wetgeving ${zaak.Nummer}`;
        const status = zaak.Afgedaan ? 'in_force' : 'amended';
        const issuedDate = (zaak.GestartOp ?? '')?.substring(0, 10);
        const tkUrl = `https://www.tweedekamer.nl/kamerstukken/wetsvoorstellen/detail?dossier=${zaak.Nummer}`;
        const description = [
          zaak.Onderwerp ?? '',
          zaak.HuidigeBehandelstatus ? `Status: ${zaak.HuidigeBehandelstatus}` : '',
          zaak.Nummer ? `Dossiernr: ${zaak.Nummer}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        try {
          insertDoc.run(docId, title, status, issuedDate, tkUrl, description);

          // Try to link to a statute
          const statuteId = zaak.Nummer ? findStatuteByDossier(db, zaak.Nummer) : null;

          if (statuteId) {
            const summary = [title, description].filter(Boolean).join('\n');
            const kamerstukRef = zaak.Nummer ? `Kamerstukken II ${zaak.Nummer}` : '';

            insertPrepWork.run(statuteId, docId, kamerstukRef, 'voorstel_van_wet', title, summary);

            if (insertPrepFull) {
              const prepRow = db
                .prepare('SELECT id FROM preparatory_works WHERE prep_document_id = ?')
                .get(docId) as { id: number } | undefined;
              if (prepRow) {
                insertPrepFull.run(prepRow.id, summary);
              }
            }

            linked++;
          }

          inserted++;
        } catch {
          skipped++;
        }
      }
    });

    insertBatch();
    skip += zaken.length;

    if (processed % 1000 === 0 || processed >= Math.min(totalCount, MAX_ROWS)) {
      console.log(
        `  [${processed}] inserted=${inserted} linked=${linked} skipped=${skipped} failed=${failed}`,
      );
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  // Finalize
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  console.log(`\n═══ Tweede Kamer Ingestion Complete ═══`);
  console.log(`  Inserted:      ${inserted}`);
  console.log(`  Linked to law: ${linked}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Failed:        ${failed}`);
  console.log(`  Database:      ${DB_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
