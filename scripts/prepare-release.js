#!/usr/bin/env node

/**
 * prepare-release.js — Gzip the database for GitHub Release upload.
 *
 * Usage:
 *   npm run prepare-release
 *
 * Then upload the artifact:
 *   gh release create v1.0.0
 *   gh release upload v1.0.0 data/database.db.gz
 */

import { createReadStream, createWriteStream, statSync } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/database.db');
const GZ_PATH = resolve(__dirname, '../data/database.db.gz');

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  console.log(`Compressing ${DB_PATH}...`);

  const inputSize = statSync(DB_PATH).size;
  console.log(`  Input size: ${formatBytes(inputSize)}`);

  const source = createReadStream(DB_PATH);
  const gzip = createGzip({ level: 9 });
  const dest = createWriteStream(GZ_PATH);

  await pipeline(source, gzip, dest);

  const outputSize = statSync(GZ_PATH).size;
  const ratio = ((1 - outputSize / inputSize) * 100).toFixed(1);

  console.log(`  Output size: ${formatBytes(outputSize)} (${ratio}% reduction)`);
  console.log(`  Output file: ${GZ_PATH}`);
  console.log();
  console.log('Upload to GitHub Release:');
  console.log('  gh release create v<version>');
  console.log('  gh release upload v<version> data/database.db.gz');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
