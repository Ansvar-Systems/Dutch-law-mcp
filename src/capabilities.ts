/**
 * Runtime capability detection for Dutch Law MCP server.
 *
 * Detects available features by checking which tables exist in the database.
 * This allows the same server code to work with both free and paid-tier databases —
 * the database contents determine the behavior, not configuration flags.
 */

import type Database from '@ansvar/mcp-sqlite';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Capability =
  | 'core_legislation'
  | 'basic_case_law'
  | 'eu_references'
  | 'expanded_case_law'
  | 'full_preparatory_works'
  | 'agency_guidance';

export type Tier = 'free' | 'professional' | 'unknown';

export interface DbMetadata {
  tier: Tier;
  schema_version: string;
  built_at: string;
  builder: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table → Capability mapping
// ─────────────────────────────────────────────────────────────────────────────

const CAPABILITY_TABLES: Record<Capability, string> = {
  core_legislation: 'legal_provisions',
  basic_case_law: 'case_law',
  eu_references: 'eu_references',
  expanded_case_law: 'case_law_full',
  full_preparatory_works: 'preparatory_works_full',
  agency_guidance: 'agency_guidance',
};

const PROFESSIONAL_CAPABILITIES: Capability[] = [
  'expanded_case_law',
  'full_preparatory_works',
  'agency_guidance',
];

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect which capabilities are available based on table existence.
 * A capability is present if its required table exists in the schema.
 */
export function detectCapabilities(db: InstanceType<typeof Database>): Set<Capability> {
  const capabilities = new Set<Capability>();

  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map(r => r.name)
  );

  for (const [capability, table] of Object.entries(CAPABILITY_TABLES)) {
    if (tables.has(table)) {
      capabilities.add(capability as Capability);
    }
  }

  return capabilities;
}

/**
 * Read db_metadata table if it exists. Returns defaults if table is missing.
 */
export function readDbMetadata(db: InstanceType<typeof Database>): DbMetadata {
  const defaults: DbMetadata = {
    tier: 'unknown',
    schema_version: '1',
    built_at: 'unknown',
    builder: 'unknown',
  };

  try {
    const hasTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='db_metadata'"
    ).get();

    if (!hasTable) return defaults;

    const rows = db.prepare('SELECT key, value FROM db_metadata').all() as { key: string; value: string }[];
    const meta = { ...defaults };

    for (const row of rows) {
      if (row.key === 'tier' && (row.value === 'free' || row.value === 'professional')) {
        meta.tier = row.value;
      } else if (row.key === 'schema_version') {
        meta.schema_version = row.value;
      } else if (row.key === 'built_at') {
        meta.built_at = row.value;
      } else if (row.key === 'builder') {
        meta.builder = row.value;
      }
    }

    return meta;
  } catch {
    return defaults;
  }
}

/**
 * Check if a specific capability requires the professional tier.
 */
export function isProfessionalCapability(capability: Capability): boolean {
  return PROFESSIONAL_CAPABILITIES.includes(capability);
}

/**
 * Standard upgrade message when a professional feature is requested but unavailable.
 */
export function upgradeMessage(feature: string): string {
  return (
    `${feature} is not available in this free community instance. ` +
    `The full case law and preparatory works databases are too large to serve from a free hosted endpoint. ` +
    `These datasets are included when Ansvar delivers consulting services, and may become available as a separate paid service in the future.`
  );
}

/**
 * Check whether a specific table exists in the database.
 * Useful for guarding tool execution against missing tables on the free tier.
 */
export function hasTable(db: InstanceType<typeof Database>, tableName: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return row != null;
}
