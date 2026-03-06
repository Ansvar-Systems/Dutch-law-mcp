import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { resolveDocumentId } from '../utils/document-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchLegislationInput {
  query: string;
  document_id?: string;
  status?: string;
  as_of_date?: string;
  limit?: number;
}

export interface SearchLegislationResult {
  document_id: string;
  document_title: string;
  provision_ref: string;
  book: string | null;
  chapter: string | null;
  section: string | null;
  title: string | null;
  snippet: string;
  relevance: number;
  valid_from?: string | null;
  valid_to?: string | null;
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
  documentId: string | undefined,
  status: string | undefined,
  limit: number,
): SearchLegislationResult[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  conditions.push('provisions_fts MATCH ?');
  params.push(ftsQuery);

  if (documentId) {
    conditions.push('p.document_id = ?');
    params.push(documentId);
  }

  if (status) {
    conditions.push('d.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      p.document_id,
      d.title AS document_title,
      p.provision_ref,
      p.book,
      p.chapter,
      p.section,
      p.title,
      snippet(provisions_fts, 0, '**', '**', '...', 32) AS snippet,
      bm25(provisions_fts) AS relevance
    FROM provisions_fts
    JOIN legal_provisions AS p ON provisions_fts.rowid = p.id
    JOIN legal_documents AS d ON p.document_id = d.id
    ${whereClause}
    ORDER BY bm25(provisions_fts)
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...params) as SearchLegislationResult[];
}

function runVersionedFtsSearch(
  db: Database,
  ftsQuery: string,
  asOfDate: string,
  documentId: string | undefined,
  status: string | undefined,
  limit: number,
): SearchLegislationResult[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  conditions.push('provision_versions_fts MATCH ?');
  params.push(ftsQuery);

  conditions.push('(pv.valid_from IS NULL OR pv.valid_from <= ?)');
  params.push(asOfDate);

  conditions.push('(pv.valid_to IS NULL OR pv.valid_to > ?)');
  params.push(asOfDate);

  if (documentId) {
    conditions.push('pv.document_id = ?');
    params.push(documentId);
  }

  if (status) {
    conditions.push('d.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      pv.document_id,
      d.title AS document_title,
      pv.provision_ref,
      pv.book,
      pv.chapter,
      pv.section,
      pv.title,
      snippet(provision_versions_fts, 0, '**', '**', '...', 32) AS snippet,
      bm25(provision_versions_fts) AS relevance,
      pv.valid_from,
      pv.valid_to
    FROM provision_versions_fts
    JOIN legal_provision_versions AS pv ON provision_versions_fts.rowid = pv.id
    JOIN legal_documents AS d ON pv.document_id = d.id
    ${whereClause}
    ORDER BY bm25(provision_versions_fts)
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...params) as SearchLegislationResult[];
}

/**
 * Deduplicate search results by document_title + provision_ref.
 * Keeps the first (highest-ranked) occurrence.
 */
function deduplicateResults(
  rows: SearchLegislationResult[],
  limit: number,
): SearchLegislationResult[] {
  const seen = new Set<string>();
  const deduped: SearchLegislationResult[] = [];
  for (const row of rows) {
    const key = `${row.document_title}::${row.provision_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export async function searchLegislation(
  db: Database,
  input: SearchLegislationInput,
): Promise<ToolResponse<SearchLegislationResult[]>> {
  const { query, status } = input;
  const asOfDate = normalizeAsOfDate(input.as_of_date);
  const limit = clampLimit(input.limit);
  // Fetch extra rows to account for deduplication
  const fetchLimit = limit * 2;

  const variants = buildFtsQueryVariants(query);
  if (!variants.primary) {
    return { results: [], _metadata: generateResponseMetadata(db) };
  }

  // Resolve document_id from title if provided
  let resolvedDocId: string | undefined;
  if (input.document_id) {
    const resolved = resolveDocumentId(db, input.document_id);
    resolvedDocId = resolved ?? undefined;
    if (!resolved) {
      return {
        results: [],
        _metadata: {
          ...generateResponseMetadata(db),
          note: `No document found matching "${input.document_id}"`,
        },
      };
    }
  }

  const search = asOfDate
    ? (q: string) => runVersionedFtsSearch(db, q, asOfDate, resolvedDocId, status, fetchLimit)
    : (q: string) => runFtsSearch(db, q, resolvedDocId, status, fetchLimit);

  let results = search(variants.primary);
  let broadened = false;

  if (results.length === 0 && variants.fallback) {
    results = search(variants.fallback);
    broadened = results.length > 0;
  }

  const deduped = deduplicateResults(results, limit);

  return {
    results: deduped,
    _metadata: {
      ...generateResponseMetadata(db),
      ...(broadened ? { query_strategy: 'broadened' } : {}),
    },
  };
}
