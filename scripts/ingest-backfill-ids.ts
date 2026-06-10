#!/usr/bin/env tsx
/**
 * Targeted BWB backfill: fetch an explicit list of BWB ids (one per line) and
 * write seeds for them. Built for the 2026-06-10 coverage reconciliation
 * (fleet#233): the deployed corpus contains ~1,170 documents (AMvBs, older
 * instruments) that the SRU `dcterms.type=wet` discovery never returns — this
 * fetches exactly those so a corpus swap never regresses coverage. The
 * canonical list lives at data/backfill-ids.txt (`npm run ingest:backfill`).
 *
 * Acquisition is per-id SRU resolution to the NEWEST in-force toestand — the
 * un-versioned repository URL 301-redirects to the OLDEST toestand and is
 * never used. Three outcomes are kept strictly apart:
 *
 *   gone   — zero SRU records or 404/no provisions upstream: a finding
 *            (genuinely gone), reported and skipped.
 *   error  — transport/parse/local-write failure: retried, then counted as a
 *            FAILURE; the run exits non-zero and the id is NOT recorded as
 *            gone. A flaky network must never read as upstream deletions.
 *   ok     — seed written, stamped with the fetched toestand.
 *
 * Usage: tsx scripts/ingest-backfill-ids.ts <id-list-file> [--force] [--refresh]
 *   --force    refetch every id, even with a fresh seed present
 *   --refresh  refetch ids whose newest upstream toestand differs from the
 *              seed's stamp (or whose freshness cannot be proven)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';
import { decideFetch, type SeedIngestMeta } from '../src/ingest/refresh-policy.js';
import { parseIdList } from '../src/ingest/id-list.js';
import { resolveNewestToestand } from '../src/ingest/sru-resolve.js';
import { fetchWithRetry } from '../src/ingest/http-retry.js';
import { buildSeed } from '../src/ingest/seed-writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const RATE_LIMIT_MS = 2000;

const QUARANTINE_DIR = path.resolve(__dirname, '..', 'data', 'seed-gone');
// Run-stamped report paths: fixed names go stale and concurrent runs clobber.
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const GONE_FILE = `/tmp/dutch-backfill-gone-${RUN_STAMP}.txt`;
const ERROR_FILE = `/tmp/dutch-backfill-errors-${RUN_STAMP}.txt`;

const listFile = process.argv[2];
const FORCE = process.argv.includes('--force');
const REFRESH = process.argv.includes('--refresh');
if (!listFile) {
  process.stderr.write(
    'Usage: tsx scripts/ingest-backfill-ids.ts <id-list-file> [--force] [--refresh]\n',
  );
  process.exit(2);
}

const ids = parseIdList(fs.readFileSync(listFile, 'utf-8'));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function quarantineSeed(id: string, seedPath: string): void {
  // A gone document's seed must not keep flowing into builds as current law.
  // Quarantine (not delete): the corpus differ surfaces the removal at swap
  // time and the operator can audit/restore.
  if (!fs.existsSync(seedPath)) return;
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  fs.renameSync(seedPath, path.join(QUARANTINE_DIR, `${id}.json`));
  console.log(`    quarantined stale seed -> data/seed-gone/${id}.json`);
}

function readExistingMeta(seedPath: string): SeedIngestMeta | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { _ingest?: SeedIngestMeta };
    return parsed._ingest ?? null;
  } catch {
    return null; // unreadable seed -> freshness unprovable -> refetch
  }
}

async function main(): Promise<void> {
  console.log(`=== BWB targeted backfill: ${ids.length} ids ===`);
  const today = new Date().toISOString().slice(0, 10);
  let fetched = 0;
  let gone = 0;
  let skipped = 0;
  const goneIds: string[] = [];
  const errorIds: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const tag = `  [${i + 1}/${ids.length}] ${id}`;
    const seedPath = path.join(SEED_DIR, `${id}.json`);
    const seedExists = fs.existsSync(seedPath);

    // Cheap skip without a network call: additive mode keeps any existing seed.
    if (seedExists && !FORCE && !REFRESH) {
      skipped++;
      continue;
    }

    try {
      const resolved = await resolveNewestToestand(id, { today });
      if (!resolved) {
        console.log(`${tag} — no SRU records (gone upstream)`);
        gone++;
        goneIds.push(id);
        quarantineSeed(id, seedPath);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      if (seedExists && !FORCE) {
        const decision = decideFetch({
          seedExists,
          refresh: REFRESH,
          existingMeta: readExistingMeta(seedPath),
          sruModified: resolved.modified,
          upstreamToestand: resolved.toestand,
        });
        if (decision === 'skip_existing' || decision === 'skip_current') {
          skipped++;
          await sleep(RATE_LIMIT_MS);
          continue;
        }
        console.log(`${tag} — ${decision}, fetching...`);
      }

      if (!resolved.toestandUrl) {
        // No toestand URL means we cannot acquire current text safely; the
        // un-versioned URL would silently serve the oldest consolidation.
        throw new Error('SRU record carries no toestand URL');
      }

      const res = await fetchWithRetry(resolved.toestandUrl);
      if (res.status === 404 || res.status === 410) {
        // Only an explicit not-found is "gone" — the SRU resolution seconds
        // earlier proved the document EXISTS, so any other failure status
        // (403/400/...) is an acquisition problem, never a deletion finding.
        console.log(`${tag} — HTTP ${res.status} (gone upstream)`);
        gone++;
        goneIds.push(id);
        quarantineSeed(id, seedPath);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      if (!res.ok) {
        throw new Error(`document fetch failed: HTTP ${res.status}`);
      }
      const parsed = parseBwbXml(await res.text());
      if (parsed.bwb_id && parsed.bwb_id !== id) {
        throw new Error(
          `body identity mismatch: fetched ${resolved.toestandUrl}, got ${parsed.bwb_id}`,
        );
      }
      if (!parsed.provisions.length) {
        console.log(`${tag} — no provisions (gone/empty upstream)`);
        gone++;
        goneIds.push(id);
        quarantineSeed(id, seedPath);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      const seed = buildSeed({
        bwbId: id,
        title: parsed.title,
        provisions: parsed.provisions,
        in_force_date: parsed.in_force_date,
        status: resolved.status,
        sruModified: resolved.modified,
        toestand: resolved.toestand,
        now: new Date().toISOString(),
      });
      fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), 'utf-8');
      console.log(
        `${tag} — ${parsed.provisions.length} provisions (toestand ${resolved.toestand ?? '?'})`,
      );
      fetched++;
    } catch (e) {
      // Transport/parse/local failure — a FAILURE, never "gone".
      console.error(`${tag} — ERROR ${(e as Error).message}`);
      errorIds.push(id);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(
    `\n=== Backfill complete: ${fetched} fetched, ${gone} gone, ${errorIds.length} errors, ${skipped} skipped ===`,
  );
  if (goneIds.length) {
    fs.writeFileSync(GONE_FILE, goneIds.join('\n'), 'utf-8');
    console.log(`gone ids (verified absent upstream) written to ${GONE_FILE}`);
  }
  if (errorIds.length) {
    fs.writeFileSync(ERROR_FILE, errorIds.join('\n'), 'utf-8');
    console.error(
      `${errorIds.length} id(s) FAILED (transport/parse) — written to ${ERROR_FILE}; ` +
        'these are NOT gone upstream. Exiting non-zero.',
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error during backfill:', err);
  process.exit(1);
});
