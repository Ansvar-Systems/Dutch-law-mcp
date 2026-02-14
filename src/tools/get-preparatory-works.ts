import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { hasTable } from '../capabilities.js';

export interface GetPreparatoryWorksInput {
  statute_id: string;
  document_type?: string;
  limit?: number;
}

export interface GetPreparatoryWorksResult {
  statute_id: string;
  statute_title: string;
  prep_document_id: string;
  kamerstuk_ref: string | null;
  document_type: string | null;
  title: string | null;
  summary: string | null;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(limit, MAX_LIMIT));
}

export async function getPreparatoryWorks(
  db: Database,
  input: GetPreparatoryWorksInput,
): Promise<ToolResponse<GetPreparatoryWorksResult[]>> {
  // Guard: check that preparatory_works table exists (missing on free tier)
  if (!hasTable(db, 'preparatory_works')) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db),
      upgrade_notice:
        'Preparatory works (kamerstukken) are not available in this free community instance. ' +
        'The parliamentary documents database is too large to serve from a free hosted endpoint. ' +
        'These datasets are included when Ansvar delivers consulting services, and may become available as a separate paid service in the future.',
    } as ToolResponse<GetPreparatoryWorksResult[]> & { upgrade_notice: string };
  }

  const { statute_id, document_type } = input;
  const limit = clampLimit(input.limit);

  const conditions: string[] = ['pw.statute_id = ?'];
  const params: (string | number)[] = [statute_id];

  if (document_type) {
    conditions.push('pw.document_type = ?');
    params.push(document_type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT
      pw.statute_id,
      d.title AS statute_title,
      pw.prep_document_id,
      pw.kamerstuk_ref,
      pw.document_type,
      pw.title,
      pw.summary
    FROM preparatory_works AS pw
    JOIN legal_documents AS d ON pw.statute_id = d.id
    ${whereClause}
    ORDER BY pw.id
    LIMIT ?
  `;
  params.push(limit);

  const results = db.prepare(sql).all(...params) as GetPreparatoryWorksResult[];
  return { results, _metadata: generateResponseMetadata(db) };
}
