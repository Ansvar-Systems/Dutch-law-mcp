import type { Database } from '@ansvar/mcp-sqlite';
import type { DutchImplementation } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetDutchImplementationsInput {
  eu_document_id: string;
  primary_only?: boolean;
  in_force_only?: boolean;
}

export interface GetDutchImplementationsResult {
  eu_document: {
    id: string;
    type: 'directive' | 'regulation';
    year: number;
    number: number;
    title?: string;
    short_name?: string;
    celex_number?: string;
  };
  implementations: DutchImplementation[];
  statistics: {
    total_statutes: number;
    primary_implementations: number;
    in_force: number;
    repealed: number;
  };
}

interface EUDocRow {
  id: string;
  type: string;
  year: number;
  number: number;
  title: string | null;
  short_name: string | null;
  celex_number: string | null;
}

interface ImplementationRow {
  bwb_id: string;
  title: string;
  short_name: string | null;
  status: string;
  reference_type: string;
  is_primary_implementation: number;
  implementation_status: string | null;
  eu_article: string | null;
}

export async function getDutchImplementations(
  db: Database,
  input: GetDutchImplementationsInput,
): Promise<ToolResponse<GetDutchImplementationsResult>> {
  const { eu_document_id, primary_only, in_force_only } = input;

  // Fetch the EU document info
  const euDocRow = db.prepare(
    `SELECT id, type, year, number, title, short_name, celex_number
     FROM eu_documents WHERE id = ?`,
  ).get(eu_document_id) as EUDocRow | undefined;

  const eu_document = euDocRow
    ? {
        id: euDocRow.id,
        type: euDocRow.type as 'directive' | 'regulation',
        year: euDocRow.year,
        number: euDocRow.number,
        title: euDocRow.title ?? undefined,
        short_name: euDocRow.short_name ?? undefined,
        celex_number: euDocRow.celex_number ?? undefined,
      }
    : {
        id: eu_document_id,
        type: 'directive' as const,
        year: 0,
        number: 0,
      };

  // Build the query for implementations
  const conditions: string[] = ['er.eu_document_id = ?'];
  const params: (string | number)[] = [eu_document_id];

  if (primary_only) {
    conditions.push('er.is_primary_implementation = 1');
  }

  if (in_force_only) {
    conditions.push("ld.status = 'in_force'");
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT
      ld.id AS bwb_id,
      ld.title,
      ld.short_name,
      ld.status,
      er.reference_type,
      er.is_primary_implementation,
      er.implementation_status,
      er.eu_article
    FROM eu_references AS er
    JOIN legal_documents AS ld ON er.document_id = ld.id
    ${whereClause}
    ORDER BY ld.title
  `;

  const rows = db.prepare(sql).all(...params) as ImplementationRow[];

  // Group by bwb_id, collecting article references
  const implMap = new Map<string, DutchImplementation>();
  for (const row of rows) {
    const existing = implMap.get(row.bwb_id);
    if (existing) {
      if (row.eu_article) {
        if (!existing.articles_referenced) {
          existing.articles_referenced = [];
        }
        if (!existing.articles_referenced.includes(row.eu_article)) {
          existing.articles_referenced.push(row.eu_article);
        }
      }
    } else {
      const impl: DutchImplementation = {
        bwb_id: row.bwb_id,
        title: row.title,
        short_name: row.short_name ?? undefined,
        status: row.status,
        reference_type: row.reference_type as DutchImplementation['reference_type'],
        is_primary_implementation: row.is_primary_implementation === 1,
        implementation_status: (row.implementation_status ?? undefined) as DutchImplementation['implementation_status'],
        articles_referenced: row.eu_article ? [row.eu_article] : undefined,
      };
      implMap.set(row.bwb_id, impl);
    }
  }

  const implementations = Array.from(implMap.values());

  const total_statutes = implementations.length;
  const primary_implementations = implementations.filter(i => i.is_primary_implementation).length;
  const in_force = implementations.filter(i => i.status === 'in_force').length;
  const repealed = implementations.filter(i => i.status === 'repealed').length;

  const result: GetDutchImplementationsResult = {
    eu_document,
    implementations,
    statistics: {
      total_statutes,
      primary_implementations,
      in_force,
      repealed,
    },
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
