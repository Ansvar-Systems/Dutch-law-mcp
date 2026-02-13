import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { searchLegislation, type SearchLegislationResult } from './search-legislation.js';
import { searchCaseLaw, type SearchCaseLawResult } from './search-case-law.js';

export interface BuildLegalStanceInput {
  query: string;
  document_id?: string;
  as_of_date?: string;
  limit?: number;
}

export interface BuildLegalStanceResult {
  query: string;
  provisions: SearchLegislationResult[];
  case_law: SearchCaseLawResult[];
  preparatory_works: PreparatoryWorkSummary[];
  cross_references: CrossReferenceSummary[];
}

interface PreparatoryWorkSummary {
  statute_id: string;
  prep_document_id: string;
  kamerstuk_ref: string | null;
  document_type: string | null;
  title: string | null;
  summary: string | null;
}

interface CrossReferenceSummary {
  source_document_id: string;
  source_provision_ref: string | null;
  target_document_id: string;
  target_provision_ref: string | null;
  ref_type: string;
}

const DEFAULT_LIMIT = 5;

export async function buildLegalStance(
  db: Database,
  input: BuildLegalStanceInput,
): Promise<ToolResponse<BuildLegalStanceResult>> {
  const { query, document_id, as_of_date } = input;
  const limit = input.limit ?? DEFAULT_LIMIT;

  // 1. Search provisions
  const provisionResults = await searchLegislation(db, {
    query,
    document_id,
    as_of_date,
    limit,
  });

  // 2. Search case law
  const caseLawResults = await searchCaseLaw(db, {
    query,
    limit,
  });

  // 3. Collect relevant statute IDs from provisions
  const statuteIds = [...new Set(provisionResults.results.map(p => p.document_id))];

  // 4. Fetch preparatory works for found statutes
  const preparatoryWorks: PreparatoryWorkSummary[] = [];
  if (statuteIds.length > 0) {
    const placeholders = statuteIds.map(() => '?').join(',');
    const prepSql = `
      SELECT
        pw.statute_id,
        pw.prep_document_id,
        pw.kamerstuk_ref,
        pw.document_type,
        pw.title,
        pw.summary
      FROM preparatory_works AS pw
      WHERE pw.statute_id IN (${placeholders})
      ORDER BY pw.id
    `;
    const prepRows = db.prepare(prepSql).all(...statuteIds) as PreparatoryWorkSummary[];
    preparatoryWorks.push(...prepRows);
  }

  // 5. Collect provision refs from found provisions and case law
  const provisionDocRefs = provisionResults.results.map(p => ({
    doc: p.document_id,
    ref: p.provision_ref,
  }));
  const caseLawDocIds = caseLawResults.results.map(c => c.document_id);
  const allDocIds = [...new Set([...statuteIds, ...caseLawDocIds])];

  // 6. Fetch cross-references for relevant documents
  const crossReferences: CrossReferenceSummary[] = [];
  if (allDocIds.length > 0) {
    const placeholders = allDocIds.map(() => '?').join(',');
    const xrefSql = `
      SELECT
        source_document_id,
        source_provision_ref,
        target_document_id,
        target_provision_ref,
        ref_type
      FROM cross_references
      WHERE source_document_id IN (${placeholders})
         OR target_document_id IN (${placeholders})
      ORDER BY id
    `;
    const xrefRows = db.prepare(xrefSql).all(...allDocIds, ...allDocIds) as CrossReferenceSummary[];
    crossReferences.push(...xrefRows);
  }

  // Suppress unused variable warning — provisionDocRefs is used for future extension
  void provisionDocRefs;

  const result: BuildLegalStanceResult = {
    query,
    provisions: provisionResults.results,
    case_law: caseLawResults.results,
    preparatory_works: preparatoryWorks,
    cross_references: crossReferences,
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
