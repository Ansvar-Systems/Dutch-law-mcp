/**
 * check_data_freshness — Report the age and freshness of each data source in the database.
 *
 * Freshness information is stored per-source in the db_metadata table and embedded
 * in every tool response's _metadata block, but this dedicated tool makes it
 * directly callable so agents can check data currency before relying on results.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface CheckDataFreshnessInput {
  source?: 'statutes' | 'case_law' | 'eu_references';
}

interface SourceFreshness {
  source: string;
  last_updated: string;
  age_days: number | null;
  status: 'fresh' | 'stale' | 'unknown';
  threshold_days: number;
}

// Consider a source stale if not updated within this many days.
const STALENESS_THRESHOLDS: Record<string, number> = {
  statutes: 30,
  case_law: 14,
  eu_references: 90,
};

export async function checkDataFreshness(
  db: InstanceType<typeof Database>,
  input: CheckDataFreshnessInput,
): Promise<{
  overall_status: 'fresh' | 'stale' | 'unknown';
  sources: SourceFreshness[];
  checked_at: string;
  _metadata: { tool: string };
}> {
  const checkedAt = new Date().toISOString();
  const sourcesToCheck = input.source ? [input.source] : ['statutes', 'case_law', 'eu_references'];

  const freshnessList: SourceFreshness[] = sourcesToCheck.map((source) => {
    const lastUpdated = getSourceLastUpdated(db, source);
    const threshold = STALENESS_THRESHOLDS[source] ?? 30;
    const ageDays = computeAgeDays(lastUpdated);

    let status: 'fresh' | 'stale' | 'unknown';
    if (ageDays === null) {
      status = 'unknown';
    } else if (ageDays > threshold) {
      status = 'stale';
    } else {
      status = 'fresh';
    }

    return { source, last_updated: lastUpdated ?? 'unknown', age_days: ageDays, status, threshold_days: threshold };
  });

  const statuses = freshnessList.map((f) => f.status);
  let overallStatus: 'fresh' | 'stale' | 'unknown';
  if (statuses.includes('stale')) {
    overallStatus = 'stale';
  } else if (statuses.every((s) => s === 'unknown')) {
    overallStatus = 'unknown';
  } else {
    overallStatus = 'fresh';
  }

  return {
    overall_status: overallStatus,
    sources: freshnessList,
    checked_at: checkedAt,
    _metadata: { tool: 'check_data_freshness' },
  };
}

function getSourceLastUpdated(
  db: InstanceType<typeof Database>,
  source: string,
): string | undefined {
  // Keys written by the database builder follow the pattern `<source>_last_updated`
  // with a fallback to the generic `last_updated` key.
  const sourceKey = `${source}_last_updated`;
  try {
    const row = db
      .prepare('SELECT value FROM db_metadata WHERE key = ?')
      .get(sourceKey) as { value: string } | undefined;
    if (row?.value) return row.value;

    // Generic fallback
    const fallback = db
      .prepare("SELECT value FROM db_metadata WHERE key = 'last_updated'")
      .get() as { value: string } | undefined;
    return fallback?.value;
  } catch {
    return undefined;
  }
}

function computeAgeDays(dateStr: string | undefined): number | null {
  if (!dateStr || dateStr === 'unknown') return null;
  try {
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return null;
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
