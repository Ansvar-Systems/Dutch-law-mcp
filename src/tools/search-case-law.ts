import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { hasTable } from '../capabilities.js';

export interface SearchCaseLawInput {
  query: string;
  court?: string;
  ecli?: string;
  legal_domain?: string;
  procedure_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface SearchCaseLawResult {
  document_id: string;
  document_title: string;
  ecli: string;
  court: string;
  case_number: string | null;
  decision_date: string | null;
  procedure_type: string | null;
  legal_domain: string | null;
  summary: string | null;
  snippet: string | null;
  relevance: number | null;
  url: string | null;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(limit, MAX_LIMIT));
}

function ecliToUrl(ecli: string | null): string | null {
  if (ecli) return `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(ecli)}`;
  return null;
}

function lookupByEcli(db: Database, ecli: string): SearchCaseLawResult[] {
  const sql = `
    SELECT
      cl.document_id,
      cl.case_number AS document_title,
      cl.ecli,
      cl.court,
      cl.case_number,
      cl.decision_date,
      cl.procedure_type,
      cl.legal_domain,
      cl.summary,
      NULL AS snippet,
      NULL AS relevance
    FROM case_law AS cl
    WHERE cl.ecli = ?
  `;
  const rows = db.prepare(sql).all(ecli) as SearchCaseLawResult[];
  return rows.map((r) => ({ ...r, url: ecliToUrl(r.ecli) }));
}

function runFtsSearch(
  db: Database,
  ftsQuery: string,
  court: string | undefined,
  legalDomain: string | undefined,
  procedureType: string | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  limit: number,
): SearchCaseLawResult[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  conditions.push('case_law_fts MATCH ?');
  params.push(ftsQuery);

  if (court) {
    conditions.push('cl.court = ?');
    params.push(court);
  }

  if (legalDomain) {
    conditions.push('cl.legal_domain = ?');
    params.push(legalDomain);
  }

  if (procedureType) {
    conditions.push('cl.procedure_type = ?');
    params.push(procedureType);
  }

  if (dateFrom) {
    conditions.push('cl.decision_date >= ?');
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('cl.decision_date <= ?');
    params.push(dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      cl.document_id,
      cl.case_number AS document_title,
      cl.ecli,
      cl.court,
      cl.case_number,
      cl.decision_date,
      cl.procedure_type,
      cl.legal_domain,
      cl.summary,
      snippet(case_law_fts, 0, '**', '**', '...', 32) AS snippet,
      bm25(case_law_fts) AS relevance
    FROM case_law_fts
    JOIN case_law AS cl ON case_law_fts.rowid = cl.id
    ${whereClause}
    ORDER BY bm25(case_law_fts)
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as SearchCaseLawResult[];
  return rows.map((r) => ({ ...r, url: ecliToUrl(r.ecli) }));
}

export async function searchCaseLaw(
  db: Database,
  input: SearchCaseLawInput,
): Promise<ToolResponse<SearchCaseLawResult[]>> {
  // Guard: check that case law tables exist (missing on free tier)
  if (!hasTable(db, 'case_law')) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db),
      upgrade_notice:
        'Case law search is not available in this free community instance. ' +
        'The Dutch case law database (900,000+ court decisions) is too large to serve from a free hosted endpoint. ' +
        'These datasets are included when Ansvar delivers consulting services, and may become available as a separate paid service in the future.',
    } as ToolResponse<SearchCaseLawResult[]> & { upgrade_notice: string };
  }

  const { court, legal_domain, procedure_type, date_from, date_to } = input;
  const limit = clampLimit(input.limit);

  // If ECLI is provided, do a direct lookup
  if (input.ecli) {
    const results = lookupByEcli(db, input.ecli);
    return { results, _metadata: generateResponseMetadata(db) };
  }

  const variants = buildFtsQueryVariants(input.query);
  if (variants.tooBroad) {
    return {
      results: [],
      _metadata: {
        ...generateResponseMetadata(db),
        note:
          `Query too broad: "${input.query}" contains only common Dutch words. ` +
          'Please provide at least one specific legal term.',
      },
    };
  }
  if (!variants.primary) {
    return { results: [], _metadata: generateResponseMetadata(db) };
  }

  let results = runFtsSearch(
    db,
    variants.primary,
    court,
    legal_domain,
    procedure_type,
    date_from,
    date_to,
    limit,
  );

  if (results.length === 0 && variants.fallback) {
    results = runFtsSearch(
      db,
      variants.fallback,
      court,
      legal_domain,
      procedure_type,
      date_from,
      date_to,
      limit,
    );
  }

  return { results, _metadata: generateResponseMetadata(db) };
}
