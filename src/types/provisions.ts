export interface LegalProvision {
  id: number;
  document_id: string;
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ProvisionRef {
  document_id: string;
  book?: string;
  chapter?: string;
  article: string;
}

export interface CrossReference {
  source_document_id: string;
  source_provision_ref?: string;
  target_document_id: string;
  target_provision_ref?: string;
  ref_type: 'references' | 'amended_by' | 'implements' | 'see_also';
}
