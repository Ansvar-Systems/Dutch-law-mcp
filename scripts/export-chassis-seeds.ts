#!/usr/bin/env tsx
/**
 * Export the BWB ingest seeds (data/seed/*.json) as canonical chassis
 * StatuteSeed JSON for the fleet translator (default out: data/chassis-seed/).
 *
 * The export stage must never silently shrink the corpus (the same
 * silent-truncation class the SRU hardening closes at discovery):
 *
 *   - every dropped provision (empty/whitespace content) is ENUMERATED on
 *     stderr so a corpus swap can be audited ref-by-ref;
 *   - every skipped seed file is named, with its reason;
 *   - output files from a previous run whose seed no longer exports (or no
 *     longer exists) are DELETED — the fleet translator ingests every JSON in
 *     the directory, so a stale leftover becomes zombie law in prod;
 *   - any skip or orphan removal exits non-zero so a pipeline cannot treat a
 *     shrunken export as a clean input.
 *
 * Usage: tsx scripts/export-chassis-seeds.ts [outDir]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toChassisSeed, droppedProvisionRefs } from '../src/ingest/chassis-seed-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const OUT_DIR = path.resolve(
  process.argv[2] ?? path.resolve(__dirname, '..', 'data', 'chassis-seed'),
);

fs.mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
let skipped = 0;
let droppedProvisionCount = 0;
const produced = new Set<string>();

for (const f of fs
  .readdirSync(SEED_DIR)
  .filter((x) => x.startsWith('BWB') && x.endsWith('.json'))
  .sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf-8')) as Parameters<
    typeof toChassisSeed
  >[0];
  try {
    const dropped = droppedProvisionRefs(raw);
    if (dropped.length > 0) {
      droppedProvisionCount += dropped.length;
      process.stderr.write(
        `DROP ${f}: ${dropped.length} empty provision(s): ${dropped.join(', ')}\n`,
      );
    }
    const seed = toChassisSeed(raw);
    if (seed.provisions.length === 0) {
      process.stderr.write(`SKIP ${f}: zero exportable provisions\n`);
      skipped++;
      continue;
    }
    fs.writeFileSync(path.join(OUT_DIR, f), JSON.stringify(seed, null, 1), 'utf-8');
    produced.add(f);
    ok++;
  } catch (e) {
    process.stderr.write(`SKIP ${f}: ${(e as Error).message}\n`);
    skipped++;
  }
}

// Remove output files this run did not produce: their seed was deleted or no
// longer exports. Leaving them would feed the previous run's text to the
// translator as if it were current.
let orphans = 0;
for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith('.json'))) {
  if (!produced.has(f)) {
    fs.unlinkSync(path.join(OUT_DIR, f));
    process.stderr.write(`ORPHAN ${f}: removed (not produced by this run)\n`);
    orphans++;
  }
}

console.log(
  `exported ${ok} chassis seeds to ${OUT_DIR} ` +
    `(${skipped} skipped, ${droppedProvisionCount} provisions dropped, ${orphans} orphans removed)`,
);

if (skipped > 0 || orphans > 0) {
  console.error(
    'Export shrank relative to the seed set (skips and/or orphan removals) — exiting non-zero; ' +
      'audit the stderr enumeration before building a corpus from this output.',
  );
  process.exitCode = 1;
}
