#!/usr/bin/env tsx
/**
 * Export the BWB ingest seeds (data/seed/*.json) as canonical chassis
 * StatuteSeed JSON for the fleet translator (default out: data/chassis-seed/).
 *
 * Usage: tsx scripts/export-chassis-seeds.ts [outDir]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toChassisSeed } from '../src/ingest/chassis-seed-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const OUT_DIR = path.resolve(
  process.argv[2] ?? path.resolve(__dirname, '..', 'data', 'chassis-seed'),
);

fs.mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
let skipped = 0;
for (const f of fs
  .readdirSync(SEED_DIR)
  .filter((x) => x.startsWith('BWB') && x.endsWith('.json'))
  .sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf-8')) as Parameters<
    typeof toChassisSeed
  >[0];
  try {
    const seed = toChassisSeed(raw);
    if (seed.provisions.length === 0) {
      skipped++;
      continue;
    }
    fs.writeFileSync(path.join(OUT_DIR, f), JSON.stringify(seed, null, 1), 'utf-8');
    ok++;
  } catch (e) {
    process.stderr.write(`SKIP ${f}: ${(e as Error).message}\n`);
    skipped++;
  }
}
console.log(`exported ${ok} chassis seeds to ${OUT_DIR} (${skipped} skipped)`);
