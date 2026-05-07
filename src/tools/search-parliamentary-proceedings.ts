import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { hasTable } from '../capabilities.js';
import {
  buildCitation,
  withCitationAttribution,
  type CitationMetadata,
} from '../utils/citation.js';

export interface SearchParliamentaryProceedingsInput {
  query: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface SearchParliamentaryProceedingsResult {
  id: number;
  title: string;
  summary: string | null;
  issued_date: string | null;
  snippet: string | null;
  relevance: number | null;
  url: string | null;
  related_statute_id: string | null;
  _citation?: CitationMetadata;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(limit, MAX_LIMIT));
}

function runFtsSearch(
  db: Database,
  ftsQuery: string,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  limit: number,
): SearchParliamentaryProceedingsResult[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  conditions.push('agency_guidance_fts MATCH ?');
  params.push(ftsQuery);

  if (dateFrom) {
    conditions.push('ag.issued_date >= ?');
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('ag.issued_date <= ?');
    params.push(dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      ag.id,
      ag.title,
      ag.summary,
      ag.issued_date,
      snippet(agency_guidance_fts, 2, '**', '**', '...', 32) AS snippet,
      bm25(agency_guidance_fts) AS relevance,
      ag.url,
      ag.related_statute_id
    FROM agency_guidance_fts
    JOIN agency_guidance AS ag ON agency_guidance_fts.rowid = ag.id
    ${whereClause}
    ORDER BY bm25(agency_guidance_fts)
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...params) as SearchParliamentaryProceedingsResult[];
}

function addResultCitations(
  rows: SearchParliamentaryProceedingsResult[],
): SearchParliamentaryProceedingsResult[] {
  return rows.map((row) => {
    const canonicalRef = `NL parliamentary proceeding ${row.id}`;
    const citation = buildCitation(
      canonicalRef,
      row.title || canonicalRef,
      'search_parliamentary_proceedings',
      { query: row.title || canonicalRef },
      row.url,
      [row.related_statute_id].filter((value): value is string => Boolean(value)),
    );

    return {
      ...row,
      _citation: withCitationAttribution(citation, {
        jurisdiction: 'NL',
        source: row.title,
        article: row.related_statute_id || canonicalRef,
        publisher: 'Tweede Kamer / ParlaMint-NL',
        license: 'Dutch parliamentary open data',
        effective_date: row.issued_date,
      }),
    };
  });
}

export async function searchParliamentaryProceedings(
  db: Database,
  input: SearchParliamentaryProceedingsInput,
): Promise<ToolResponse<SearchParliamentaryProceedingsResult[]>> {
  // Guard: check that agency_guidance table exists (missing on free tier)
  if (!hasTable(db, 'agency_guidance')) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db),
      upgrade_notice:
        'Parliamentary proceedings search is not available in this free community instance. ' +
        'The Dutch parliamentary speech corpus (Tweede Kamer/ParlaMint-NL) is too large to serve from a free hosted endpoint. ' +
        'These datasets are included when Ansvar delivers consulting services, and may become available as a separate paid service in the future.',
    } as ToolResponse<SearchParliamentaryProceedingsResult[]> & { upgrade_notice: string };
  }

  const { date_from, date_to } = input;
  const limit = clampLimit(input.limit);

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

  let results = runFtsSearch(db, variants.primary, date_from, date_to, limit);

  if (results.length === 0 && variants.fallback) {
    results = runFtsSearch(db, variants.fallback, date_from, date_to, limit);
  }

  return { results: addResultCitations(results), _metadata: generateResponseMetadata(db) };
}
