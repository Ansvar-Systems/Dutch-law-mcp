#!/usr/bin/env tsx
/**
 * Targeted BWB backfill: fetch an explicit list of BWB ids (one per line) and
 * write seeds for them. Built for the 2026-06-10 coverage reconciliation
 * (fleet#233): the deployed corpus contains ~1,170 documents (AMvBs, older
 * instruments) that the SRU `dcterms.type=wet` discovery never returns — this
 * fetches exactly those, fresh, so a corpus swap never regresses coverage.
 *
 * A document that no longer exists upstream (404 / no provisions) is reported
 * and skipped — that is a finding (genuinely gone), not an error.
 *
 * Usage: tsx scripts/ingest-backfill-ids.ts <id-list-file> [--force]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';
import { stampIngestMeta } from '../src/ingest/refresh-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const BWB_XML_BASE = 'https://repository.officiele-overheidspublicaties.nl/bwb';
const RATE_LIMIT_MS = 2000;

const listFile = process.argv[2];
const FORCE = process.argv.includes('--force');
if (!listFile) {
  process.stderr.write('Usage: tsx scripts/ingest-backfill-ids.ts <id-list-file> [--force]\n');
  process.exit(2);
}

const ids = fs
  .readFileSync(listFile, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^BWB[RV]\d+$/.test(l));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log(`=== BWB targeted backfill: ${ids.length} ids ===`);
  let fetched = 0;
  let gone = 0;
  let skipped = 0;
  const goneIds: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const seedPath = path.join(SEED_DIR, `${id}.json`);
    if (fs.existsSync(seedPath) && !FORCE) {
      skipped++;
      continue;
    }
    const url = `${BWB_XML_BASE}/${id}/xml/${id}.xml`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`  [${i + 1}/${ids.length}] ${id} — HTTP ${res.status} (gone upstream)`);
        gone++;
        goneIds.push(id);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      const parsed = parseBwbXml(await res.text());
      if (!parsed.provisions.length) {
        console.log(`  [${i + 1}/${ids.length}] ${id} — no provisions (gone/empty upstream)`);
        gone++;
        goneIds.push(id);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      const seed = stampIngestMeta(
        {
          documents: [
            {
              id,
              type: 'statute' as const,
              status: 'in_force',
              ...(parsed.in_force_date ? { in_force_date: parsed.in_force_date } : {}),
              title: parsed.title,
              url: `https://wetten.overheid.nl/${id}`,
            },
          ],
          provisions: parsed.provisions.map((p) => ({
            document_id: id,
            provision_ref: p.provision_ref,
            book: p.book,
            chapter: p.chapter,
            section: p.section,
            article: p.article,
            title: p.title,
            content: p.content,
          })),
        },
        // sru_modified unknown for direct fetches: null => refresh mode treats
        // freshness as unprovable and refetches — accuracy over cheapness.
        { sruModified: null, now: new Date().toISOString() },
      );
      fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), 'utf-8');
      console.log(`  [${i + 1}/${ids.length}] ${id} — ${parsed.provisions.length} provisions`);
      fetched++;
    } catch (e) {
      console.log(`  [${i + 1}/${ids.length}] ${id} — ERROR ${(e as Error).message}`);
      gone++;
      goneIds.push(id);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(
    `\n=== Backfill complete: ${fetched} fetched, ${gone} gone/error, ${skipped} already present ===`,
  );
  if (goneIds.length) {
    fs.writeFileSync('/tmp/dutch-backfill-gone.txt', goneIds.join('\n'), 'utf-8');
    console.log(`gone ids written to /tmp/dutch-backfill-gone.txt`);
  }
}

void main();
