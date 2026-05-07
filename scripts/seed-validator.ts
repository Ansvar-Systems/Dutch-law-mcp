/**
 * seed-validator.ts — Citation seed integrity checks.
 *
 * Extracted from build-db.ts so the validator can be unit-tested without
 * triggering the full build-db CLI side effects on import.
 */

export interface DocumentSeed {
  id: string;
  type: 'statute' | 'amvb' | 'ministerial_regulation' | 'kamerstuk' | 'case_law';
  title: string;
  title_en?: string;
  short_name?: string;
  status?: string;
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
}

export interface ProvisionSeed {
  document_id: string;
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string;
  metadata?: string;
}

export interface ProvisionVersionSeed {
  document_id: string;
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string;
  metadata?: string;
  valid_from?: string;
  valid_to?: string;
}

export interface CaseLawSeed {
  document_id: string;
  court: string;
  ecli?: string;
  case_number?: string;
  decision_date?: string;
  procedure_type?: string;
  legal_domain?: string;
  summary?: string;
  keywords?: string;
}

export interface PreparatoryWorkSeed {
  statute_id: string;
  prep_document_id: string;
  kamerstuk_ref?: string;
  document_type?: string;
  title?: string;
  summary?: string;
}

export interface SeedFile {
  documents?: DocumentSeed[];
  provisions?: ProvisionSeed[];
  provision_versions?: ProvisionVersionSeed[];
  case_law?: CaseLawSeed[];
  preparatory_works?: PreparatoryWorkSeed[];
  // Other top-level keys (definitions, cross_references, eu_*) exist on the
  // SeedFile shape used by build-db.ts but aren't validated here yet.
  [key: string]: unknown;
}

export function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

export function validateCitationSeedFields(seeds: SeedFile[]): void {
  const documentIds = new Set<string>();

  for (const seed of seeds) {
    for (const doc of seed.documents ?? []) {
      if (isBlank(doc.id) || isBlank(doc.title)) {
        throw new Error(
          `Citation metadata requires non-empty document id and title: ${JSON.stringify(doc)}`,
        );
      }
      documentIds.add(doc.id);
    }
  }

  for (const seed of seeds) {
    for (const provision of seed.provisions ?? []) {
      if (
        isBlank(provision.document_id) ||
        isBlank(provision.provision_ref) ||
        isBlank(provision.article)
      ) {
        throw new Error(
          `Citation metadata requires non-empty provision document_id, provision_ref, and article: ${JSON.stringify(
            provision,
          )}`,
        );
      }
      if (!documentIds.has(provision.document_id)) {
        throw new Error(
          `Citation metadata requires a source document for provision ${provision.document_id}:${provision.provision_ref}`,
        );
      }
    }

    for (const provision of seed.provision_versions ?? []) {
      if (
        isBlank(provision.document_id) ||
        isBlank(provision.provision_ref) ||
        isBlank(provision.article)
      ) {
        throw new Error(
          `Citation metadata requires non-empty versioned provision document_id, provision_ref, and article: ${JSON.stringify(
            provision,
          )}`,
        );
      }
      if (!documentIds.has(provision.document_id)) {
        throw new Error(
          `Citation metadata requires a source document for versioned provision ${provision.document_id}:${provision.provision_ref}`,
        );
      }
    }

    for (const caseLaw of seed.case_law ?? []) {
      if (isBlank(caseLaw.document_id) || isBlank(caseLaw.court)) {
        throw new Error(
          `Citation metadata requires non-empty case law document_id and court: ${JSON.stringify(
            caseLaw,
          )}`,
        );
      }
      if (!documentIds.has(caseLaw.document_id)) {
        throw new Error(
          `Citation metadata requires a source document for case law ${caseLaw.document_id} (FK violation)`,
        );
      }
    }

    for (const prep of seed.preparatory_works ?? []) {
      if (isBlank(prep.statute_id) || isBlank(prep.prep_document_id)) {
        throw new Error(
          `Citation metadata requires non-empty preparatory work statute_id and prep_document_id: ${JSON.stringify(
            prep,
          )}`,
        );
      }
      if (!documentIds.has(prep.statute_id)) {
        throw new Error(
          `Citation metadata requires a source document for preparatory work statute_id ${prep.statute_id} (FK violation)`,
        );
      }
      if (!documentIds.has(prep.prep_document_id)) {
        throw new Error(
          `Citation metadata requires a source document for preparatory work prep_document_id ${prep.prep_document_id} (FK violation)`,
        );
      }
    }
  }
}
