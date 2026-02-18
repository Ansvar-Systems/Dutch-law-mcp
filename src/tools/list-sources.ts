/**
 * list_sources — Expose data provenance metadata as an MCP tool.
 *
 * Returns information about the authoritative data sources backing this server,
 * including coverage, freshness, and licensing. No database access required.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ListSourcesInput {
  include_stats?: boolean;
}

interface SourceInfo {
  name: string;
  authority: string;
  url: string;
  license: string;
  coverage: string;
  languages: string[];
}

interface SourceStats {
  statutes: number;
  provisions: number;
  case_law: number;
  preparatory_works: number;
  eu_documents: number;
  definitions: number;
}

export async function listSources(
  db: InstanceType<typeof Database>,
  input: ListSourcesInput,
): Promise<{
  sources: SourceInfo[];
  data_freshness: { last_verified: string; update_frequency: string };
  stats?: SourceStats;
  _metadata: { tool: string; source_authority: string };
}> {
  const sources: SourceInfo[] = [
    {
      name: 'Wetten.overheid.nl',
      authority: 'Dutch Government (Overheid.nl)',
      url: 'https://wetten.overheid.nl',
      license: 'Government Open Data (CC0)',
      coverage: 'All consolidated Dutch statutes, AMvBs, and ministerial regulations',
      languages: ['nl'],
    },
    {
      name: 'Rechtspraak.nl',
      authority: 'De Rechtspraak (Dutch Judiciary)',
      url: 'https://uitspraken.rechtspraak.nl',
      license: 'Open Justice Data',
      coverage: 'Published court decisions from all Dutch courts',
      languages: ['nl'],
    },
    {
      name: 'EUR-Lex',
      authority: 'European Union (Publications Office)',
      url: 'https://eur-lex.europa.eu',
      license: 'EU Open Data (Decision 2011/833/EU)',
      coverage: 'EU directives and regulations referenced by Dutch statutes (metadata only)',
      languages: ['nl', 'en'],
    },
  ];

  const result: {
    sources: SourceInfo[];
    data_freshness: { last_verified: string; update_frequency: string };
    stats?: SourceStats;
    _metadata: { tool: string; source_authority: string };
  } = {
    sources,
    data_freshness: {
      last_verified: getLastVerified(db),
      update_frequency: 'daily (automated checks)',
    },
    _metadata: {
      tool: 'list_sources',
      source_authority: 'wetten.overheid.nl, rechtspraak.nl, eur-lex.europa.eu',
    },
  };

  if (input.include_stats) {
    result.stats = collectStats(db);
  }

  return result;
}

function getLastVerified(db: InstanceType<typeof Database>): string {
  try {
    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'last_updated'").get() as
      | { value: string }
      | undefined;
    return row?.value ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function collectStats(db: InstanceType<typeof Database>): SourceStats {
  const count = (table: string): number => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      return row.n;
    } catch {
      return 0;
    }
  };

  return {
    statutes: count('legal_documents'),
    provisions: count('legal_provisions'),
    case_law: count('case_law'),
    preparatory_works: count('preparatory_works'),
    eu_documents: count('eu_documents'),
    definitions: count('definitions'),
  };
}
