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
 * Safety: refuses an empty/missing seed dir outright (an empty seed dir +
 * orphan removal would wipe OUT_DIR), and refuses bulk orphan removal beyond
 * a small fraction of the produced set without --prune (fat-finger guard for
 * the operator-supplied outDir).
 *
 * Usage: tsx scripts/export-chassis-seeds.ts [outDir] [--prune]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toChassisSeed, droppedProvisionRefs } from '../src/ingest/chassis-seed-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const args = process.argv.slice(2).filter((a) => a !== '--prune');
const PRUNE = process.argv.includes('--prune');
const OUT_DIR = path.resolve(args[0] ?? path.resolve(__dirname, '..', 'data', 'chassis-seed'));

const seedFiles = fs.existsSync(SEED_DIR)
  ? fs
      .readdirSync(SEED_DIR)
      .filter((x) => x.startsWith('BWB') && x.endsWith('.json'))
      .sort()
  : [];
if (seedFiles.length === 0) {
  console.error(
    `No seeds found in ${SEED_DIR} — refusing to export (and orphan-clean) from an empty seed dir.`,
  );
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
let skipped = 0;
let droppedProvisionCount = 0;
const produced = new Set<string>();

for (const f of seedFiles) {
  try {
    // Parse INSIDE the try: an unreadable seed must be a named SKIP, not an
    // anonymous crash that aborts the audit and the orphan pass.
    const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf-8')) as Parameters<
      typeof toChassisSeed
    >[0];
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
// translator as if it were current. Bulk removal needs --prune: a mostly-empty
// seed dir pointed at a populated OUT_DIR must not silently wipe it.
const orphanFiles = fs
  .readdirSync(OUT_DIR)
  .filter((x) => x.endsWith('.json'))
  .filter((f) => !produced.has(f));
let orphans = 0;
const orphanCap = Math.max(50, Math.ceil(produced.size * 0.05));
if (orphanFiles.length > orphanCap && !PRUNE) {
  console.error(
    `REFUSING orphan removal: ${orphanFiles.length} orphans exceed the safety cap of ${orphanCap} ` +
      `(5% of ${produced.size} produced). If this shrink is intended, re-run with --prune.`,
  );
  process.exitCode = 1;
} else {
  for (const f of orphanFiles) {
    fs.unlinkSync(path.join(OUT_DIR, f));
    process.stderr.write(`ORPHAN ${f}: removed (not produced by this run)\n`);
    orphans++;
  }
}

console.log(
  `exported ${ok} chassis seeds to ${OUT_DIR} ` +
    `(${skipped} skipped, ${droppedProvisionCount} provisions dropped, ${orphans} orphans removed)`,
);

if (skipped > 0 || orphans > 0 || droppedProvisionCount > 0) {
  console.error(
    'Export shrank relative to the seed set (skips, orphan removals and/or dropped provisions) — ' +
      'exiting non-zero; audit the stderr enumeration before building a corpus from this output.',
  );
  process.exitCode = 1;
}
