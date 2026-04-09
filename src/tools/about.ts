/**
 * about — Return server identity, version, data sources, and runtime capabilities.
 *
 * Exposes the same provenance information available via the MCP resource
 * `case-law-stats://dutch-law-mcp/metadata` as a directly callable tool,
 * so agents that prefer tool calls over resource reads can access it.
 */

import type Database from '@ansvar/mcp-sqlite';
import { detectCapabilities, readDbMetadata } from '../capabilities.js';
import { SERVER_NAME, SERVER_VERSION } from '../version.js';

export interface AboutInput {
  // No required inputs — tool returns static + runtime info.
}

export async function about(
  db: InstanceType<typeof Database>,
  _input: AboutInput,
): Promise<{
  name: string;
  version: string;
  description: string;
  sources: Record<string, { name: string; url: string; license: string; description: string }>;
  capabilities: string[];
  tier: string;
  db_built_at: string;
  attribution: string;
  _metadata: { tool: string };
}> {
  const caps = detectCapabilities(db);
  const dbMeta = readDbMetadata(db);

  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description:
      'Dutch Law MCP provides structured access to Dutch statutes (wetten.overheid.nl), court decisions (rechtspraak.nl), and EU legal references (EUR-Lex) via the Model Context Protocol.',
    sources: {
      statutes: {
        name: 'Wetten.overheid.nl',
        url: 'https://wetten.overheid.nl',
        license: 'Government Open Data (CC0)',
        description: 'Official BWB (Basiswettenbestand) for all consolidated Dutch statutes and regulations',
      },
      case_law: {
        name: 'Rechtspraak.nl',
        url: 'https://uitspraken.rechtspraak.nl',
        license: 'Open Justice Data',
        description: 'Published court decisions from all Dutch courts',
      },
      eu_law: {
        name: 'EUR-Lex',
        url: 'https://eur-lex.europa.eu',
        license: 'EU Open Data (Decision 2011/833/EU)',
        description: 'EU directives and regulations referenced by Dutch statutes (metadata only)',
      },
    },
    capabilities: [...caps],
    tier: dbMeta.tier,
    db_built_at: dbMeta.built_at,
    attribution:
      'Data sourced from wetten.overheid.nl and rechtspraak.nl under open data licenses. EU law metadata from EUR-Lex.',
    _metadata: { tool: 'about' },
  };
}
