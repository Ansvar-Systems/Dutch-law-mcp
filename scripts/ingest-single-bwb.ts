#!/usr/bin/env tsx
/**
 * One-off targeted ingestion — fetches a small list of BWB IDs directly.
 *
 * Bypasses the SRU discovery phase (which enumerates ~24K records over
 * ~8 minutes) by resolving each id individually: SRU id lookup → newest
 * in-force toestand → fetch that XML. The un-versioned repository URL is
 * never used (it 301-redirects to the OLDEST toestand). Used to validate
 * parser/ingest changes end-to-end before kicking off a full unlimited run.
 *
 * Seeds are written through the shared builder, so they carry the same
 * `_ingest` stamp (retrieved_at, sru_modified, toestand) as discovery seeds
 * and the refresh policy can reason about them.
 *
 * Any id that fails (transport, parse, no provisions) is counted and the
 * process exits non-zero — a validation run that fetched nothing must never
 * look like a pass.
 *
 * Usage:
 *   tsx scripts/ingest-single-bwb.ts [--concurrency N] BWBR0040940 [BWBR... ...]
 *
 * Side-effect: writes data/seed/<bwbId>.json for each successful fetch.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';
import { resolveNewestToestand } from '../src/ingest/sru-resolve.js';
import { fetchWithRetry } from '../src/ingest/http-retry.js';
import { buildSeed } from '../src/ingest/seed-writer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');

async function fetchBwb(bwbId: string): Promise<boolean> {
  console.log(`Resolving ${bwbId} via SRU id lookup`);
  const today = new Date().toISOString().slice(0, 10);

  const resolved = await resolveNewestToestand(bwbId, { today });
  if (!resolved) {
    console.error(`  ${bwbId}: no SRU records upstream — skipping`);
    return false;
  }
  if (!resolved.toestandUrl) {
    console.error(
      `  ${bwbId}: SRU record carries no toestand URL — refusing the un-versioned URL (serves the oldest consolidation)`,
    );
    return false;
  }

  console.log(`  Fetching toestand ${resolved.toestand ?? '?'} from ${resolved.toestandUrl}`);
  const res = await fetchWithRetry(resolved.toestandUrl);
  if (!res.ok) {
    console.error(`  ${bwbId}: HTTP ${res.status} — skipping`);
    return false;
  }
  const xml = await res.text();
  const parsed = parseBwbXml(xml);
  if (!parsed.bwb_id) {
    console.error(`  ${bwbId}: no bwb_id parsed — skipping`);
    return false;
  }
  if (parsed.provisions.length === 0) {
    console.error(`  ${bwbId}: no provisions — skipping`);
    return false;
  }

  const seedData = buildSeed({
    bwbId: parsed.bwb_id,
    title: parsed.title,
    provisions: parsed.provisions,
    in_force_date: parsed.in_force_date,
    sruModified: resolved.modified,
    toestand: resolved.toestand,
    now: new Date().toISOString(),
  });

  fs.mkdirSync(SEED_DIR, { recursive: true });
  const filePath = path.join(SEED_DIR, `${parsed.bwb_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
  console.log(
    `  OK — wrote ${filePath} (${parsed.provisions.length} provisions, in_force_date=${parsed.in_force_date ?? '(none)'})`,
  );
  return true;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let concurrency = 1;
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency' && i + 1 < args.length) {
      concurrency = Math.max(1, parseInt(args[i + 1], 10) || 1);
      i++;
    } else {
      ids.push(args[i]);
    }
  }
  if (ids.length === 0) {
    console.error(
      'Usage: tsx scripts/ingest-single-bwb.ts [--concurrency N] BWBR0040940 [BWBR... ...]',
    );
    process.exit(1);
  }

  let succeeded = 0;
  let failed = 0;
  const recordOutcome = (ok: boolean): void => {
    if (ok) succeeded++;
    else failed++;
  };

  if (concurrency === 1) {
    for (const id of ids) {
      try {
        recordOutcome(await fetchBwb(id));
      } catch (err) {
        console.error(`  FATAL ${id}: ${String(err)}`);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } else {
    // Worker-pool concurrency. Keep N inflight at once, push the next one
    // into the queue as each finishes. Lets the long fetches/parses for
    // big statutes (e.g. Wetboek van Strafrecht has 670+ provisions) overlap
    // with smaller ones, cutting wall-clock time ~Nx for N concurrent workers.
    const queue = [...ids];
    let active = 0;
    await new Promise<void>((resolve) => {
      const spawn = (): void => {
        if (queue.length === 0 && active === 0) {
          resolve();
          return;
        }
        while (active < concurrency && queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          active++;
          fetchBwb(id)
            .then(recordOutcome)
            .catch((err) => {
              console.error(`  FATAL ${id}: ${String(err)}`);
              failed++;
            })
            .finally(() => {
              active--;
              spawn();
            });
        }
      };
      spawn();
    });
  }

  console.log(`Done: ${succeeded} fetched, ${failed} failed (${ids.length} requested)`);
  if (failed > 0) {
    console.error('One or more ids failed — exiting non-zero.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error during single-id ingestion:', err);
  process.exit(1);
});
