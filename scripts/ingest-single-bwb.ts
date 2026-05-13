#!/usr/bin/env tsx
/**
 * One-off targeted ingestion — fetches a small list of BWB IDs directly.
 *
 * Bypasses the SRU discovery phase (which enumerates ~24K records over
 * ~8 minutes) by going straight to BWB XML for specific known statutes.
 * Used to validate parser/ingest changes end-to-end before kicking off a
 * full unlimited run.
 *
 * Usage:
 *   tsx scripts/ingest-single-bwb.ts BWBR0040940 BWBR0001854 ...
 *
 * Side-effect: writes data/seed/<bwbId>.json for each successful fetch.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const BWB_XML_BASE = 'https://repository.officiele-overheidspublicaties.nl/bwb';

interface SeedDoc {
  id: string;
  type: 'statute';
  title: string;
  status: string;
  in_force_date?: string;
  url: string;
}

async function fetchBwb(bwbId: string): Promise<void> {
  const url = `${BWB_XML_BASE}/${bwbId}/xml/${bwbId}.xml`;
  console.log(`Fetching ${bwbId} from ${url}`);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} — skipping`);
    return;
  }
  const xml = await res.text();
  const parsed = parseBwbXml(xml);
  if (!parsed.bwb_id) {
    console.error(`  No bwb_id parsed — skipping`);
    return;
  }
  if (parsed.provisions.length === 0) {
    console.error(`  No provisions — skipping`);
    return;
  }

  const doc: SeedDoc = {
    id: parsed.bwb_id,
    type: 'statute',
    title: parsed.title,
    status: 'in_force',
    url: `https://wetten.overheid.nl/${parsed.bwb_id}`,
  };
  if (parsed.in_force_date) {
    doc.in_force_date = parsed.in_force_date;
  }

  const seedData = {
    documents: [doc],
    provisions: parsed.provisions.map((p) => ({
      document_id: parsed.bwb_id,
      provision_ref: p.provision_ref,
      book: p.book,
      chapter: p.chapter,
      section: p.section,
      article: p.article,
      title: p.title,
      content: p.content,
    })),
  };

  fs.mkdirSync(SEED_DIR, { recursive: true });
  const filePath = path.join(SEED_DIR, `${parsed.bwb_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
  console.log(
    `  OK — wrote ${filePath} (${parsed.provisions.length} provisions, in_force_date=${parsed.in_force_date ?? '(none)'})`,
  );
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: tsx scripts/ingest-single-bwb.ts BWBR0040940 [BWBR... ...]');
    process.exit(1);
  }
  for (const id of ids) {
    await fetchBwb(id);
    await new Promise((r) => setTimeout(r, 500));
  }
}

void main();
