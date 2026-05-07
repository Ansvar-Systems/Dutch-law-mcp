import { describe, expect, it } from 'vitest';

import { validateCitationSeedFields, type SeedFile } from '../../scripts/seed-validator.js';

const docAuteurswet = {
  id: 'BWBR0001886',
  type: 'statute' as const,
  title: 'Auteurswet',
  status: 'in_force',
};

const docCaseHR = {
  id: 'ECLI:NL:HR:2026:1',
  type: 'case_law' as const,
  title: 'Hoge Raad 1 januari 2026',
  status: 'in_force',
};

describe('validateCitationSeedFields', () => {
  it('passes a minimal valid seed', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docAuteurswet],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).not.toThrow();
  });

  it('rejects a case_law row whose document_id is not in legal_documents (FK violation)', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docAuteurswet],
        case_law: [
          {
            document_id: 'BWBR9999999',
            ecli: 'ECLI:NL:HR:2026:1',
            court: 'HR',
          },
        ],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).toThrow(
      /case law BWBR9999999 \(FK violation\)/,
    );
  });

  it('accepts case_law with ecli=null when document_id and court are present and FK valid', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docCaseHR],
        case_law: [
          {
            document_id: 'ECLI:NL:HR:2026:1',
            court: 'HR',
            // ecli intentionally absent
          },
        ],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).not.toThrow();
  });

  it('rejects preparatory_works with empty statute_id', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docAuteurswet],
        preparatory_works: [
          {
            statute_id: '',
            prep_document_id: 'KST-1234-5',
            kamerstuk_ref: 'Kamerstukken II 2026/27, 1234, nr. 5',
          },
        ],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).toThrow(/non-empty preparatory work/);
  });

  it('rejects preparatory_works whose statute_id is not in legal_documents (FK violation)', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docAuteurswet],
        preparatory_works: [
          {
            statute_id: 'BWBR_DOES_NOT_EXIST',
            prep_document_id: 'BWBR0001886',
          },
        ],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).toThrow(
      /preparatory work statute_id BWBR_DOES_NOT_EXIST \(FK violation\)/,
    );
  });

  it('rejects preparatory_works whose prep_document_id is not in legal_documents (FK violation)', () => {
    const seeds: SeedFile[] = [
      {
        documents: [docAuteurswet],
        preparatory_works: [
          {
            statute_id: 'BWBR0001886',
            prep_document_id: 'KST_DOES_NOT_EXIST',
          },
        ],
      },
    ];
    expect(() => validateCitationSeedFields(seeds)).toThrow(
      /preparatory work prep_document_id KST_DOES_NOT_EXIST \(FK violation\)/,
    );
  });
});
