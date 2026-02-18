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

import { createReadStream, createWriteStream, readFileSync, writeFileSync, statSync } from 'fs';
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

function syncVersions() {
  const pkgPath = resolve(__dirname, '../package.json');
  const serverJsonPath = resolve(__dirname, '../server.json');
  const dockerfilePath = resolve(__dirname, '../Dockerfile');

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const version = pkg.version;

  // Sync server.json
  const serverJson = JSON.parse(readFileSync(serverJsonPath, 'utf-8'));
  serverJson.version = version;
  if (serverJson.packages) {
    for (const p of serverJson.packages) p.version = version;
  }
  writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2) + '\n');
  console.log(`  server.json → ${version}`);

  // Sync Dockerfile label
  const dockerfile = readFileSync(dockerfilePath, 'utf-8');
  const updated = dockerfile.replace(
    /org\.opencontainers\.image\.version="[^"]*"/,
    `org.opencontainers.image.version="${version}"`,
  );
  writeFileSync(dockerfilePath, updated);
  console.log(`  Dockerfile label → ${version}`);
}

async function main() {
  console.log('Syncing versions from package.json...');
  syncVersions();
  console.log();
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
