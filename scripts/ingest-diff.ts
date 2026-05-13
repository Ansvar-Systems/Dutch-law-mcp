/**
 * Ingestion diff script — compares fetched content against stored hashes.
 *
 * Reads data/raw/ files (from ingest:fetch), hashes them, and compares
 * against data/.source-hashes.json. Writes:
 *   .ingest-changed  — "true" or "false"
 *   .ingest-summary   — human-readable change summary
 */

import { createHash } from 'crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const RAW_DIR = join(ROOT, 'data', 'raw');
const HASHES_FILE = join(ROOT, 'data', '.source-hashes.json');

interface HashStore {
  last_check: string;
  sources: Record<string, string>;
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function hashFile(path: string): string {
  const content = readFileSync(path, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

function main(): void {
  // Load previous hashes
  let previousHashes: HashStore = { last_check: '', sources: {} };
  if (existsSync(HASHES_FILE)) {
    previousHashes = JSON.parse(readFileSync(HASHES_FILE, 'utf-8')) as HashStore;
  }

  // Hash current files
  const currentFiles = collectFiles(RAW_DIR);
  const currentHashes: Record<string, string> = {};
  for (const file of currentFiles) {
    const key = file.replace(RAW_DIR + '/', '');
    currentHashes[key] = hashFile(file);
  }

  // Compare
  const newFiles: string[] = [];
  const changedFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const [key, hash] of Object.entries(currentHashes)) {
    if (!(key in previousHashes.sources)) {
      newFiles.push(key);
    } else if (previousHashes.sources[key] !== hash) {
      changedFiles.push(key);
    }
  }
  for (const key of Object.keys(previousHashes.sources)) {
    if (!(key in currentHashes)) {
      removedFiles.push(key);
    }
  }

  const hasChanges = newFiles.length > 0 || changedFiles.length > 0 || removedFiles.length > 0;

  // Write outputs
  writeFileSync(join(ROOT, '.ingest-changed'), hasChanges ? 'true' : 'false');

  const summary = hasChanges
    ? `${newFiles.length} new, ${changedFiles.length} updated, ${removedFiles.length} removed`
    : 'No changes detected';
  writeFileSync(join(ROOT, '.ingest-summary'), summary);

  // Update stored hashes
  const newStore: HashStore = {
    last_check: new Date().toISOString(),
    sources: currentHashes,
  };
  writeFileSync(HASHES_FILE, JSON.stringify(newStore, null, 2));

  console.log(summary);
  if (hasChanges) {
    if (newFiles.length > 0) console.log(`  New: ${newFiles.join(', ')}`);
    if (changedFiles.length > 0) console.log(`  Changed: ${changedFiles.join(', ')}`);
    if (removedFiles.length > 0) console.log(`  Removed: ${removedFiles.join(', ')}`);
  }
}

main();
