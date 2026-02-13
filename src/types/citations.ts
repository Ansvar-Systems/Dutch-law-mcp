import type { DocumentType, DocumentStatus } from './documents.js';

export type CitationFormat = 'full' | 'short' | 'pinpoint';

export interface ParsedCitation {
  raw: string;
  type: DocumentType | 'eu_directive' | 'eu_regulation';
  document_id: string;
  book?: string;
  article?: string;
  lid?: string;
  code_abbreviation?: string;
  ecli?: string;
  chamber?: string;
  valid: boolean;
  error?: string;
}

export interface ValidationResult {
  citation: ParsedCitation;
  document_exists: boolean;
  provision_exists: boolean;
  status?: DocumentStatus;
  document_title?: string;
  warnings: string[];
}
