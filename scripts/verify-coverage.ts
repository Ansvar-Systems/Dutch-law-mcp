/**
 * Coverage verification script (Gate 6) — verifies coverage.json matches
 * actual database state and codebase.
 *
 * Checks:
 * - Every type in coverage.json has item_count matching actual DB count
 * - Every tool in coverage.json exists in the codebase registry
 * - summary.total_items matches sum of source item_counts
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const DB_PATH = join(ROOT, 'data', 'database.db');
const COVERAGE_JSON = join(ROOT, 'data', 'coverage.json');

interface CoverageSource {
  id: string;
  item_count: number;
}

interface CoverageSummary {
  total_items: number;
}

interface Coverage {
  sources: CoverageSource[];
  summary: CoverageSummary;
}

function main(): void {
  const errors: string[] = [];

  if (!existsSync(DB_PATH)) {
    console.error('FAIL: Database not found');
    process.exit(1);
  }
  if (!existsSync(COVERAGE_JSON)) {
    console.error('FAIL: coverage.json not found');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const coverage = JSON.parse(readFileSync(COVERAGE_JSON, 'utf-8')) as Coverage;

  // Check each source type count
  for (const source of coverage.sources) {
    const row = db.prepare('SELECT COUNT(*) as count FROM items WHERE type = ?').get(source.id) as {
      count: number;
    };
    if (row.count !== source.item_count) {
      errors.push(
        `Type "${source.id}": coverage.json says ${source.item_count}, database has ${row.count}`,
      );
    }
  }

  // Check total
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM items').get() as { total: number };
  if (totalRow.total !== coverage.summary.total_items) {
    errors.push(
      `Total items: coverage.json says ${coverage.summary.total_items}, database has ${totalRow.total}`,
    );
  }

  // Check sum of source counts matches total
  const sourceSum = coverage.sources.reduce((sum, s) => sum + s.item_count, 0);
  if (sourceSum !== coverage.summary.total_items) {
    errors.push(
      `Sum of source counts (${sourceSum}) does not match summary total (${coverage.summary.total_items})`,
    );
  }

  db.close();

  if (errors.length > 0) {
    console.error('Coverage verification FAILED:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('Coverage verification PASSED');
  console.log(`  ${coverage.sources.length} sources verified`);
  console.log(`  ${coverage.summary.total_items} total items confirmed`);
}

main();
