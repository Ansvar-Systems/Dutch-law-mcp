import type { Database } from '@ansvar/mcp-sqlite';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveDocumentId } from '../utils/document-id.js';
import { buildProvisionCitation, withCitationAttribution } from '../utils/citation.js';

export interface GetProvisionInput {
  document_id: string;
  book?: string;
  article?: string;
  section?: string;
  provision_ref?: string;
  as_of_date?: string;
}

export interface GetProvisionResult {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  book: string | null;
  chapter: string | null;
  section: string | null;
  article: string;
  title: string | null;
  content: string;
  source_url: string | null;
  effective_date: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

function buildProvisionRef(input: GetProvisionInput): string | undefined {
  if (input.provision_ref) return input.provision_ref;
  if (input.book && input.article) return `${input.book}:${input.article}`;
  if (input.article) return input.article;
  return undefined;
}

function getCurrentProvisions(
  db: Database,
  documentId: string,
  provisionRef: string | undefined,
): GetProvisionResult[] {
  if (provisionRef) {
    const sql = `
      SELECT
        p.document_id,
        d.title AS document_title,
        d.status AS document_status,
        p.provision_ref,
        p.book,
        p.chapter,
        p.section,
        p.article,
        p.title,
        p.content,
        COALESCE(d.url, 'https://wetten.overheid.nl/' || p.document_id) AS source_url,
        d.in_force_date AS effective_date
      FROM legal_provisions AS p
      JOIN legal_documents AS d ON p.document_id = d.id
      WHERE p.document_id = ? AND p.provision_ref = ?
    `;
    return db.prepare(sql).all(documentId, provisionRef) as GetProvisionResult[];
  }

  // No specific provision — return all provisions for this document
  const sql = `
    SELECT
      p.document_id,
      d.title AS document_title,
      d.status AS document_status,
      p.provision_ref,
      p.book,
      p.chapter,
      p.section,
      p.article,
      p.title,
      p.content,
      COALESCE(d.url, 'https://wetten.overheid.nl/' || p.document_id) AS source_url,
      d.in_force_date AS effective_date
    FROM legal_provisions AS p
    JOIN legal_documents AS d ON p.document_id = d.id
    WHERE p.document_id = ?
    ORDER BY p.id
  `;
  return db.prepare(sql).all(documentId) as GetProvisionResult[];
}

function getVersionedProvisions(
  db: Database,
  documentId: string,
  provisionRef: string | undefined,
  asOfDate: string,
): GetProvisionResult[] {
  const conditions: string[] = [
    'pv.document_id = ?',
    '(pv.valid_from IS NULL OR pv.valid_from <= ?)',
    '(pv.valid_to IS NULL OR pv.valid_to > ?)',
  ];
  const params: string[] = [documentId, asOfDate, asOfDate];

  if (provisionRef) {
    conditions.push('pv.provision_ref = ?');
    params.push(provisionRef);
  }

  const sql = `
    SELECT
      pv.document_id,
      d.title AS document_title,
      d.status AS document_status,
      pv.provision_ref,
      pv.book,
      pv.chapter,
      pv.section,
      pv.article,
      pv.title,
      pv.content,
      COALESCE(d.url, 'https://wetten.overheid.nl/' || pv.document_id) AS source_url,
      COALESCE(pv.valid_from, d.in_force_date) AS effective_date,
      pv.valid_from,
      pv.valid_to
    FROM legal_provision_versions AS pv
    JOIN legal_documents AS d ON pv.document_id = d.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY pv.id
  `;
  return db.prepare(sql).all(...params) as GetProvisionResult[];
}

export async function getProvision(
  db: Database,
  input: GetProvisionInput,
): Promise<ToolResponse<GetProvisionResult[]>> {
  // Resolve abbreviations, short names, and full titles to a DB document ID.
  const document_id = resolveDocumentId(db, input.document_id) ?? input.document_id;
  const asOfDate = normalizeAsOfDate(input.as_of_date);
  const provisionRef = buildProvisionRef(input);

  const results = asOfDate
    ? getVersionedProvisions(db, document_id, provisionRef, asOfDate)
    : getCurrentProvisions(db, document_id, provisionRef);

  const firstResult = results.length > 0 ? results[0] : null;
  return {
    results,
    ...(firstResult && {
      _citation: withCitationAttribution(
        buildProvisionCitation(
          firstResult.document_id,
          firstResult.document_title || '',
          firstResult.provision_ref || '',
          input.document_id,
          input.section || input.provision_ref || input.article || provisionRef || '',
          firstResult.source_url,
          null,
        ),
        {
          jurisdiction: 'NL',
          source: firstResult.document_title,
          article: firstResult.article || firstResult.provision_ref || null,
          publisher: 'Dutch Government (wetten.overheid.nl)',
          license: 'Public-Domain',
          effective_date: firstResult.effective_date || firstResult.valid_from || null,
        },
      ),
    }),
    _metadata: generateResponseMetadata(db),
  };
}
