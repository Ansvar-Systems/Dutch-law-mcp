import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult } from '../types/citations.js';
import type { DocumentStatus } from '../types/documents.js';
import { parseCitation } from './parser.js';

export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);
  const warnings: string[] = [];

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error || 'Invalid citation format'],
    };
  }

  // Check document existence
  let documentExists = false;
  let status: DocumentStatus | undefined;
  let documentTitle: string | undefined;

  const docRow = db.prepare(
    'SELECT id, title, status FROM legal_documents WHERE id = ?'
  ).get(parsed.document_id) as { id: string; title: string; status: string } | undefined;

  if (docRow) {
    documentExists = true;
    status = docRow.status as DocumentStatus;
    documentTitle = docRow.title;

    if (status === 'repealed') {
      warnings.push(`Document "${docRow.title}" has been repealed`);
    } else if (status === 'amended') {
      warnings.push(`Document "${docRow.title}" has been amended — verify current text`);
    }
  }

  // Check provision existence (for statutes with article ref)
  let provisionExists = false;
  if (parsed.type === 'statute' && parsed.article) {
    const provRef = parsed.book ? `${parsed.book}:${parsed.article}` : parsed.article;
    const provRow = db.prepare(
      'SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?'
    ).get(parsed.document_id, provRef);
    provisionExists = !!provRow;
  } else {
    // For non-statute types, provision check not applicable
    provisionExists = documentExists;
  }

  return {
    citation: parsed,
    document_exists: documentExists,
    provision_exists: provisionExists,
    status,
    document_title: documentTitle,
    warnings,
  };
}
