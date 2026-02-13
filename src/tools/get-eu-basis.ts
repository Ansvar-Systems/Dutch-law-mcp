import type { Database } from '@ansvar/mcp-sqlite';
import type { EUBasisDocument } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetEUBasisInput {
  document_id: string;
  include_articles?: boolean;
  reference_types?: string[];
}

export interface GetEUBasisResult {
  document_id: string;
  document_title: string;
  eu_documents: EUBasisDocument[];
  statistics: {
    total_eu_references: number;
    directive_count: number;
    regulation_count: number;
  };
}

interface EUBasisRow {
  id: string;
  type: string;
  year: number;
  number: number;
  community: string;
  celex_number: string | null;
  title: string | null;
  short_name: string | null;
  reference_type: string;
  is_primary_implementation: number;
  url_eur_lex: string | null;
  eu_article: string | null;
}

export async function getEUBasis(
  db: Database,
  input: GetEUBasisInput,
): Promise<ToolResponse<GetEUBasisResult>> {
  const { document_id, include_articles, reference_types } = input;

  // Fetch the document title
  const docRow = db.prepare(
    `SELECT title FROM legal_documents WHERE id = ?`,
  ).get(document_id) as { title: string } | undefined;

  const document_title = docRow?.title ?? '';

  // Build the query to get EU basis documents
  const conditions: string[] = ['er.document_id = ?'];
  const params: (string | number)[] = [document_id];

  if (reference_types && reference_types.length > 0) {
    const placeholders = reference_types.map(() => '?').join(', ');
    conditions.push(`er.reference_type IN (${placeholders})`);
    params.push(...reference_types);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT
      ed.id,
      ed.type,
      ed.year,
      ed.number,
      ed.community,
      ed.celex_number,
      ed.title,
      ed.short_name,
      er.reference_type,
      er.is_primary_implementation,
      ed.url_eur_lex,
      er.eu_article
    FROM eu_documents AS ed
    JOIN eu_references AS er ON ed.id = er.eu_document_id
    ${whereClause}
    ORDER BY ed.year DESC, ed.number ASC
  `;

  const rows = db.prepare(sql).all(...params) as EUBasisRow[];

  // Group by EU document, collecting articles
  const docMap = new Map<string, EUBasisDocument>();
  for (const row of rows) {
    const existing = docMap.get(row.id);
    if (existing) {
      if (include_articles && row.eu_article) {
        if (!existing.articles) {
          existing.articles = [];
        }
        if (!existing.articles.includes(row.eu_article)) {
          existing.articles.push(row.eu_article);
        }
      }
    } else {
      const doc: EUBasisDocument = {
        id: row.id,
        type: row.type as EUBasisDocument['type'],
        year: row.year,
        number: row.number,
        community: row.community as EUBasisDocument['community'],
        celex_number: row.celex_number ?? undefined,
        title: row.title ?? undefined,
        short_name: row.short_name ?? undefined,
        reference_type: row.reference_type as EUBasisDocument['reference_type'],
        is_primary_implementation: row.is_primary_implementation === 1,
        articles: include_articles && row.eu_article ? [row.eu_article] : undefined,
        url_eur_lex: row.url_eur_lex ?? undefined,
      };
      docMap.set(row.id, doc);
    }
  }

  const eu_documents = Array.from(docMap.values());

  const directive_count = eu_documents.filter(d => d.type === 'directive').length;
  const regulation_count = eu_documents.filter(d => d.type === 'regulation').length;

  const result: GetEUBasisResult = {
    document_id,
    document_title,
    eu_documents,
    statistics: {
      total_eu_references: rows.length,
      directive_count,
      regulation_count,
    },
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
