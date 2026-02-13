import type { Database } from '@ansvar/mcp-sqlite';
import type { ProvisionEUReference } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetProvisionEUBasisInput {
  document_id: string;
  provision_ref: string;
}

export interface GetProvisionEUBasisResult {
  document_id: string;
  provision_ref: string;
  provision_title: string | null;
  eu_references: ProvisionEUReference[];
  statistics: {
    total_references: number;
    directive_count: number;
    regulation_count: number;
  };
}

interface ProvisionEUReferenceRow {
  id: string;
  type: string;
  title: string | null;
  short_name: string | null;
  eu_article: string | null;
  reference_type: string;
  full_citation: string | null;
  reference_context: string | null;
}

export async function getProvisionEUBasis(
  db: Database,
  input: GetProvisionEUBasisInput,
): Promise<ToolResponse<GetProvisionEUBasisResult>> {
  const { document_id, provision_ref } = input;

  // Get provision title
  const provRow = db.prepare(
    `SELECT title FROM legal_provisions WHERE document_id = ? AND provision_ref = ?`,
  ).get(document_id, provision_ref) as { title: string | null } | undefined;

  const provision_title = provRow?.title ?? null;

  // Find the provision id
  const provIdRow = db.prepare(
    `SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?`,
  ).get(document_id, provision_ref) as { id: number } | undefined;

  if (!provIdRow) {
    const result: GetProvisionEUBasisResult = {
      document_id,
      provision_ref,
      provision_title,
      eu_references: [],
      statistics: { total_references: 0, directive_count: 0, regulation_count: 0 },
    };
    return { results: result, _metadata: generateResponseMetadata(db) };
  }

  const sql = `
    SELECT
      ed.id,
      ed.type,
      ed.title,
      ed.short_name,
      er.eu_article,
      er.reference_type,
      er.full_citation,
      er.reference_context
    FROM eu_references AS er
    JOIN eu_documents AS ed ON er.eu_document_id = ed.id
    WHERE er.provision_id = ?
    ORDER BY ed.year DESC, ed.number ASC
  `;

  const rows = db.prepare(sql).all(provIdRow.id) as ProvisionEUReferenceRow[];

  const eu_references: ProvisionEUReference[] = rows.map(row => ({
    id: row.id,
    type: row.type as ProvisionEUReference['type'],
    title: row.title ?? undefined,
    short_name: row.short_name ?? undefined,
    article: row.eu_article ?? undefined,
    reference_type: row.reference_type as ProvisionEUReference['reference_type'],
    full_citation: row.full_citation ?? '',
    context: row.reference_context ?? undefined,
  }));

  const directive_count = eu_references.filter(r => r.type === 'directive').length;
  const regulation_count = eu_references.filter(r => r.type === 'regulation').length;

  const result: GetProvisionEUBasisResult = {
    document_id,
    provision_ref,
    provision_title,
    eu_references,
    statistics: {
      total_references: eu_references.length,
      directive_count,
      regulation_count,
    },
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
