import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { withSqliteLockRetry } from '../utils/sqlite-retry.js';

export interface SearchEUImplementationsInput {
  query?: string;
  type?: 'directive' | 'regulation';
  year_from?: number;
  year_to?: number;
  community?: 'EU' | 'EG' | 'EEG' | 'Euratom';
  has_dutch_implementation?: boolean;
  limit?: number;
}

export interface EUDocumentSearchResult {
  id: string;
  type: string;
  year: number;
  number: number;
  community: string | null;
  celex_number: string | null;
  title: string | null;
  title_nl: string | null;
  short_name: string | null;
  in_force: boolean;
  url_eur_lex: string | null;
  dutch_statute_count: number;
  has_dutch_implementation: boolean;
}

export interface SearchEUImplementationsResult {
  documents: EUDocumentSearchResult[];
  total_count: number;
}

interface SearchRow {
  id: string;
  type: string;
  year: number;
  number: number;
  community: string | null;
  celex_number: string | null;
  title: string | null;
  title_nl: string | null;
  short_name: string | null;
  in_force: number;
  url_eur_lex: string | null;
  dutch_statute_count: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const QUERY_STOP_WORDS = new Set([
  'and',
  'de',
  'directive',
  'eu',
  'european',
  'implementation',
  'implementing',
  'implementation',
  'law',
  'netherlands',
  'nl',
  'of',
  'regulation',
  'the',
]);

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(limit, MAX_LIMIT));
}

function buildQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalized = trimmed
    .replace(/[(),;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const variants = new Set<string>([trimmed, normalized]);

  const compactDigits = normalized.replace(/\b([A-Za-z]{2,})\s+(\d)\b/g, '$1$2');
  const spacedDigits = normalized.replace(/\b([A-Za-z]{2,})(\d)\b/g, '$1 $2');
  variants.add(compactDigits);
  variants.add(spacedDigits);

  for (const token of normalized.split(/\s+/)) {
    const lower = token.toLowerCase();
    if (token.length >= 3 && !QUERY_STOP_WORDS.has(lower)) {
      variants.add(token);
    }
  }

  return [...variants].filter(Boolean);
}

function parseStructuredHints(query: string): {
  inferredType?: 'directive' | 'regulation';
  year?: number;
  number?: number;
} {
  const hints: { inferredType?: 'directive' | 'regulation'; year?: number; number?: number } = {};
  if (/\bdirective\b/i.test(query)) {
    hints.inferredType = 'directive';
  } else if (/\bregulation\b/i.test(query)) {
    hints.inferredType = 'regulation';
  }

  const yearNumberMatch = query.match(/\b((?:19|20)\d{2})\s*\/\s*(\d{1,5})\b/);
  if (yearNumberMatch) {
    hints.year = Number(yearNumberMatch[1]);
    hints.number = Number(yearNumberMatch[2]);
  }

  return hints;
}

export async function searchEUImplementations(
  db: Database,
  input: SearchEUImplementationsInput,
): Promise<ToolResponse<SearchEUImplementationsResult>> {
  const { query, type, year_from, year_to, community, has_dutch_implementation } = input;
  const limit = clampLimit(input.limit);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query) {
    const variants = buildQueryVariants(query);
    const hints = parseStructuredHints(query);
    const queryClauses: string[] = [];

    if (variants.length > 0) {
      queryClauses.push(
        variants
          .map(
            () =>
              '(ed.title_nl LIKE ? OR ed.title LIKE ? OR ed.short_name LIKE ? OR ed.id LIKE ? OR ed.celex_number LIKE ?)',
          )
          .join(' OR '),
      );
      for (const variant of variants) {
        const likeQuery = `%${variant}%`;
        params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
      }
    }

    if (hints.year != null && hints.number != null) {
      queryClauses.push('(ed.year = ? AND ed.number = ?)');
      params.push(hints.year, hints.number);
    }

    if (queryClauses.length > 0) {
      conditions.push(`(${queryClauses.join(' OR ')})`);
    }

    if (!type && hints.inferredType) {
      conditions.push('ed.type = ?');
      params.push(hints.inferredType);
    }
  }

  if (type) {
    conditions.push('ed.type = ?');
    params.push(type);
  }

  if (year_from != null) {
    conditions.push('ed.year >= ?');
    params.push(year_from);
  }

  if (year_to != null) {
    conditions.push('ed.year <= ?');
    params.push(year_to);
  }

  if (community) {
    conditions.push('ed.community = ?');
    params.push(community);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const havingClause =
    has_dutch_implementation === true
      ? 'HAVING dutch_statute_count > 0'
      : has_dutch_implementation === false
        ? 'HAVING dutch_statute_count = 0'
        : '';

  const sql = `
    SELECT
      ed.id,
      ed.type,
      ed.year,
      ed.number,
      ed.community,
      ed.celex_number,
      ed.title,
      ed.title_nl,
      ed.short_name,
      ed.in_force,
      ed.url_eur_lex,
      COUNT(DISTINCT er.document_id) AS dutch_statute_count
    FROM eu_documents AS ed
    LEFT JOIN eu_references AS er ON ed.id = er.eu_document_id
    ${whereClause}
    GROUP BY ed.id
    ${havingClause}
    ORDER BY ed.year DESC, ed.number ASC
    LIMIT ?
  `;
  params.push(limit);

  const rows = (await withSqliteLockRetry(() => db.prepare(sql).all(...params))) as SearchRow[];

  const documents: EUDocumentSearchResult[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    year: row.year,
    number: row.number,
    community: row.community,
    celex_number: row.celex_number,
    title: row.title,
    title_nl: row.title_nl,
    short_name: row.short_name,
    in_force: row.in_force === 1,
    url_eur_lex: row.url_eur_lex,
    dutch_statute_count: row.dutch_statute_count,
    has_dutch_implementation: row.dutch_statute_count > 0,
  }));

  const result: SearchEUImplementationsResult = {
    documents,
    total_count: documents.length,
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
