/**
 * Coverage update script — regenerates data/coverage.json and COVERAGE.md
 * from current database state.
 *
 * Reads actual item counts, types, and categories from the SQLite database
 * and produces accurate coverage manifests.
 */

import Database from 'better-sqlite3';
import { writeFileSync, readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

interface PackageJson {
  name: string;
  version: string;
}

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const DB_PATH = join(ROOT, 'data', 'database.db');
const COVERAGE_JSON = join(ROOT, 'data', 'coverage.json');
const COVERAGE_MD = join(ROOT, 'COVERAGE.md');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as PackageJson;

interface TypeCount {
  type: string;
  count: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

function main(): void {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // Count items by type
  const typeCounts = db
    .prepare('SELECT type, COUNT(*) as count FROM items GROUP BY type ORDER BY type')
    .all() as TypeCount[];

  // Count items by category
  const categoryCounts = db
    .prepare('SELECT category, COUNT(*) as count FROM items GROUP BY category ORDER BY category')
    .all() as CategoryCount[];

  // Total count
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM items').get() as { total: number };
  const total = totalRow.total;

  // Get db_metadata
  const metaRows = db.prepare('SELECT key, value FROM db_metadata').all() as {
    key: string;
    value: string;
  }[];
  const meta: Record<string, string> = {};
  for (const row of metaRows) {
    meta[row.key] = row.value;
  }

  db.close();

  // Generate coverage.json
  const coverageJson = {
    schema_version: '1.0',
    mcp_name: PKG.name.replace('@ansvar/', ''),
    mcp_type: 'domain_intelligence',
    coverage_date: new Date().toISOString().split('T')[0],
    database_version: PKG.version,
    sources: typeCounts.map((tc) => ({
      id: tc.type,
      name: tc.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      item_count: tc.count,
      item_type: tc.type,
      last_refresh: new Date().toISOString().split('T')[0],
      refresh_frequency: 'manual',
      completeness: 'full',
    })),
    summary: {
      total_items: total,
      total_types: typeCounts.length,
      total_categories: categoryCounts.length,
      db_size_mb: Math.round((statSync(DB_PATH).size / 1024 / 1024) * 10) / 10,
    },
  };

  writeFileSync(COVERAGE_JSON, JSON.stringify(coverageJson, null, 2));
  console.log(`Updated ${COVERAGE_JSON}`);

  // Generate COVERAGE.md
  let md = `# Coverage — ${PKG.name}\n\n`;
  md += `> Last verified: ${coverageJson.coverage_date} | Database version: ${PKG.version}\n\n`;
  md += `## What's Included\n\n`;
  md += `| Content Type | Items | Completeness | Refresh |\n`;
  md += `|-------------|-------|-------------|--------|\n`;
  for (const tc of typeCounts) {
    const name = tc.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    md += `| ${name} | ${tc.count} | Full | Manual |\n`;
  }
  md += `\n**Total:** ${total} items, ${coverageJson.summary.db_size_mb} MB database\n\n`;

  md += `## Categories\n\n`;
  md += `| Category | Items |\n`;
  md += `|----------|-------|\n`;
  for (const cc of categoryCounts) {
    md += `| ${cc.category} | ${cc.count} |\n`;
  }
  md += `\n`;

  md += `## What's NOT Included\n\n`;
  md += `| Gap | Reason | Planned? |\n`;
  md += `|-----|--------|----------|\n`;
  md += `| Vendor-specific product recommendations | Objectivity — no vendor endorsements | No |\n`;
  md += `| Organization-specific context | Stateless methodology server — no client data | No |\n`;
  md += `| Real-time pricing data | Pricing changes frequently — use ranges and models | No |\n`;
  md += `\n`;

  md += `## Limitations\n\n`;
  md += `- Content is curated methodology guidance, not real-time data\n`;
  md += `- Budget figures and benchmarks are ranges from public sources, not exact pricing\n`;
  md += `- Always adapt templates to your organization's specific context\n`;
  md += `\n`;

  md += `## Data Freshness\n\n`;
  md += `All content is manually curated. Call the \`check_data_freshness\` tool for current status.\n`;

  writeFileSync(COVERAGE_MD, md);
  console.log(`Updated ${COVERAGE_MD}`);
}

main();
