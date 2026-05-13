/**
 * Freshness check script — verifies database content is within expected age.
 *
 * For methodology MCPs, content is manually curated. The freshness threshold
 * is 180 days (6 months) — after that, content should be reviewed for accuracy.
 *
 * Output:
 *   .freshness-stale   — "true" or "false"
 *   .freshness-report  — human-readable freshness report
 */

import Database from 'better-sqlite3';
import { writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const DB_PATH = join(ROOT, 'data', 'database.db');
const FRESHNESS_THRESHOLD_DAYS = 180; // 6 months for methodology content

function main(): void {
  if (!existsSync(DB_PATH)) {
    writeFileSync(join(ROOT, '.freshness-stale'), 'true');
    writeFileSync(
      join(ROOT, '.freshness-report'),
      '# Freshness Report\n\nDatabase file not found.',
    );
    process.exit(0);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const metaRows = db.prepare('SELECT key, value FROM db_metadata').all() as {
    key: string;
    value: string;
  }[];
  const meta: Record<string, string> = {};
  for (const row of metaRows) {
    meta[row.key] = row.value;
  }

  const dbBuilt = meta['database_built'] ?? meta['built_date'] ?? 'unknown';
  const now = new Date();
  let stale = false;
  let daysSinceBuilt = -1;

  if (dbBuilt !== 'unknown') {
    const builtDate = new Date(dbBuilt);
    daysSinceBuilt = Math.floor((now.getTime() - builtDate.getTime()) / (1000 * 60 * 60 * 24));
    stale = daysSinceBuilt > FRESHNESS_THRESHOLD_DAYS;
  } else {
    stale = true;
  }

  const totalRow = db.prepare('SELECT COUNT(*) as total FROM items').get() as { total: number };
  db.close();

  const status = stale
    ? 'OVERDUE'
    : daysSinceBuilt > FRESHNESS_THRESHOLD_DAYS * 0.8
      ? 'Due soon'
      : 'Current';

  let report = `# Freshness Report\n\n`;
  report += `| Property | Value |\n`;
  report += `|----------|-------|\n`;
  report += `| Database built | ${dbBuilt} |\n`;
  report += `| Days since build | ${daysSinceBuilt >= 0 ? daysSinceBuilt : 'unknown'} |\n`;
  report += `| Threshold | ${FRESHNESS_THRESHOLD_DAYS} days |\n`;
  report += `| Status | **${status}** |\n`;
  report += `| Total items | ${totalRow.total} |\n`;
  report += `\n`;

  if (stale) {
    report += `## Action Required\n\n`;
    report += `Content has not been reviewed in over ${FRESHNESS_THRESHOLD_DAYS} days.\n`;
    report += `Review methodology content for accuracy and run:\n\n`;
    report += '```\nnpm run ingest:full\n```\n';
  }

  writeFileSync(join(ROOT, '.freshness-stale'), stale ? 'true' : 'false');
  writeFileSync(join(ROOT, '.freshness-report'), report);

  console.log(
    `Freshness: ${status} (${daysSinceBuilt} days since build, threshold ${FRESHNESS_THRESHOLD_DAYS})`,
  );
}

main();
