/**
 * Ingestion fetch script — checks for content changes in data/content/ YAML files.
 *
 * For methodology MCPs, "fetching upstream" means detecting changes to the
 * curated YAML content files. No external APIs to call — content is authored
 * locally and committed to the repo.
 *
 * Output: data/raw/ directory with copies of current content files for diff comparison.
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const CONTENT_DIR = join(ROOT, 'data', 'content');
const RAW_DIR = join(ROOT, 'data', 'raw');

function collectYamlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectYamlFiles(fullPath));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      files.push(fullPath);
    }
  }
  return files;
}

function main(): void {
  if (!existsSync(CONTENT_DIR)) {
    console.error(`Content directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  mkdirSync(RAW_DIR, { recursive: true });

  const yamlFiles = collectYamlFiles(CONTENT_DIR);
  console.log(`Found ${yamlFiles.length} content files in ${CONTENT_DIR}`);

  // Copy current content files to raw/ for diff comparison
  for (const file of yamlFiles) {
    const relative = file.replace(CONTENT_DIR + '/', '');
    const dest = join(RAW_DIR, relative);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, readFileSync(file, 'utf-8'));
  }

  console.log(`Fetched ${yamlFiles.length} files to ${RAW_DIR}`);
}

main();
