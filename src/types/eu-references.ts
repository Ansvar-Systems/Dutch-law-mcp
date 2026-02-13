export type EUDocumentType = 'directive' | 'regulation' | 'decision';
export type EUCommunity = 'EU' | 'EG' | 'EEG' | 'Euratom';

export type ReferenceType =
  | 'implements' | 'supplements' | 'applies' | 'references'
  | 'complies_with' | 'derogates_from' | 'amended_by' | 'repealed_by' | 'cites_article';

export type ImplementationStatus = 'complete' | 'partial' | 'pending' | 'unknown';

export interface EUDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  title_nl?: string;
  short_name?: string;
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force: boolean;
  amended_by?: string;
  repeals?: string;
  url_eur_lex?: string;
  description?: string;
  last_updated?: string;
}

export interface EUReference {
  id: number;
  source_type: 'provision' | 'document' | 'case_law';
  source_id: string;
  document_id: string;
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;
  reference_type: ReferenceType;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  created_at?: string;
  last_verified?: string;
}

export interface EUBasisDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  short_name?: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  articles?: string[];
  url_eur_lex?: string;
}

export interface DutchImplementation {
  bwb_id: string;
  title: string;
  short_name?: string;
  status: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  articles_referenced?: string[];
}

export interface ProvisionEUReference {
  id: string;
  type: EUDocumentType;
  title?: string;
  short_name?: string;
  article?: string;
  reference_type: ReferenceType;
  full_citation: string;
  context?: string;
}
