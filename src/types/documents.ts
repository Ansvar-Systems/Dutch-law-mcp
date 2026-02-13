export type DocumentType = 'statute' | 'amvb' | 'ministerial_regulation' | 'kamerstuk' | 'case_law';

export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

export type CourtType =
  | 'HR' | 'PHR'
  | 'RVS' | 'CRVB' | 'CBB'
  | 'GHAMS' | 'GHARL' | 'GHDHA' | 'GHSHE'
  | 'RBAMS' | 'RBDHA' | 'RBGEL' | 'RBMNE' | 'RBNHO' | 'RBNNE' | 'RBOBR' | 'RBOVE' | 'RBROT' | 'RBZWB';

export interface LegalDocument {
  id: string;
  type: DocumentType;
  title: string;
  title_en?: string;
  short_name?: string;
  status: DocumentStatus;
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
}
